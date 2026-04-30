import { Clipboard, LogOut, Pause, Play, RotateCcw, Square, StepBack, StepForward, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { api, getApiError } from '../api.js';
import ChatPanel from '../components/ChatPanel.jsx';
import YouTubePlayer from '../components/YouTubePlayer.jsx';
import { useAuth } from '../state/AuthContext.jsx';

const PLAYER_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2
};

function formatSeconds(value) {
  const safe = Math.max(0, Math.floor(value || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const playerRef = useRef(null);
  const socketRef = useRef(null);
  const suppressPlayerEventRef = useRef(false);
  const pendingStateRef = useRef(null);

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [presence, setPresence] = useState({ count: 0, userIds: [] });
  const [error, setError] = useState('');
  const [playerReady, setPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [socketConnected, setSocketConnected] = useState(false);

  const canControl = useMemo(() => Boolean(room?.currentUserRole), [room?.currentUserRole]);

  const applyPlayerState = useCallback((state) => {
    if (!playerRef.current) {
      pendingStateRef.current = state;
      return;
    }

    suppressPlayerEventRef.current = true;
    const position = Number(state.positionSec ?? 0);

    if (state.status === 'stopped') {
      playerRef.current.stop();
    } else {
      playerRef.current.seekTo(position);
      if (state.status === 'playing') {
        playerRef.current.play();
      } else {
        playerRef.current.pause();
      }
    }

    setCurrentTime(position);
    window.setTimeout(() => {
      suppressPlayerEventRef.current = false;
    }, 800);
  }, []);

  const sendSync = useCallback(
    (action, position = currentTime) => {
      if (!socketRef.current || !canControl) {
        return;
      }

      socketRef.current.emit(`sync:video_${action}`, {
        roomId,
        positionSec: Math.max(0, position)
      });
    },
    [canControl, currentTime, roomId]
  );

  const handlePlayerState = useCallback(
    (state) => {
      if (suppressPlayerEventRef.current || !canControl) {
        return;
      }

      const position = playerRef.current?.getCurrentTime() ?? currentTime;
      if (state === PLAYER_STATE.PLAYING) {
        sendSync('play', position);
      }
      if (state === PLAYER_STATE.PAUSED) {
        sendSync('pause', position);
      }
      if (state === PLAYER_STATE.ENDED) {
        sendSync('stop', 0);
      }
    },
    [canControl, currentTime, sendSync]
  );

  useEffect(() => {
    let alive = true;

    async function loadRoom() {
      try {
        const [roomResponse, messagesResponse] = await Promise.all([
          api.get(`/rooms/${roomId}`),
          api.get(`/rooms/${roomId}/messages`)
        ]);
        if (!alive) {
          return;
        }
        setRoom(roomResponse.data.room);
        setMessages(messagesResponse.data.messages);
        pendingStateRef.current = roomResponse.data.room.currentState;
      } catch (requestError) {
        setError(getApiError(requestError));
      }
    }

    loadRoom();
    return () => {
      alive = false;
    };
  }, [roomId]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = io(import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:8080', {
      auth: { token },
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('room:join', { roomId });
    });

    socket.on('chat:message_sent', ({ roomId: eventRoomId, message }) => {
      if (eventRoomId !== roomId) {
        return;
      }
      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message]
      );
    });

    socket.on('sync:state_updated', ({ roomId: eventRoomId, state }) => {
      if (eventRoomId !== roomId) {
        return;
      }
      setRoom((current) => (current ? { ...current, currentState: state } : current));
      applyPlayerState(state);
    });

    socket.on('presence:updated', ({ roomId: eventRoomId, count, userIds }) => {
      if (eventRoomId === roomId) {
        setPresence({ count, userIds });
      }
    });

    socket.on('room:user_joined', ({ roomId: eventRoomId }) => {
      if (eventRoomId === roomId) {
        api.get(`/rooms/${roomId}`)
          .then((response) => setRoom(response.data.room))
          .catch((requestError) => setError(getApiError(requestError)));
      }
    });

    socket.on('room:user_left', ({ roomId: eventRoomId }) => {
      if (eventRoomId === roomId) {
        api.get(`/rooms/${roomId}`)
          .then((response) => setRoom(response.data.room))
          .catch((requestError) => setError(getApiError(requestError)));
      }
    });

    socket.on('room:deleted', ({ roomId: eventRoomId }) => {
      if (eventRoomId === roomId) {
        navigate('/dashboard', { replace: true });
      }
    });

    socket.on('connect_error', (socketError) => setError(socketError.message));
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('sync:error', ({ message }) => setError(message));
    socket.on('chat:error', ({ message }) => setError(message));
    socket.on('room:error', ({ message }) => setError(message));

    return () => {
      socket.emit('room:leave', { roomId });
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [applyPlayerState, roomId, token]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(playerRef.current?.getCurrentTime() ?? 0);
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (playerReady && pendingStateRef.current) {
      applyPlayerState(pendingStateRef.current);
      pendingStateRef.current = null;
    }
  }, [applyPlayerState, playerReady]);

  function sendMessage(content) {
    socketRef.current?.emit('chat:send_message', { roomId, content });
  }

  async function leaveRoom() {
    try {
      await api.post(`/rooms/${roomId}/leave`);
      navigate('/dashboard');
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  function copyInvite() {
    if (room) {
      navigator.clipboard?.writeText(`${window.location.origin}${room.inviteUrl}`);
    }
  }

  async function deleteRoom() {
    if (!room || room.currentUserRole !== 'owner') {
      return;
    }

    if (!window.confirm(`Удалить комнату "${room.title}"? Сообщения и участники тоже будут удалены.`)) {
      return;
    }

    try {
      await api.delete(`/rooms/${roomId}`);
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  if (!room) {
    return <main className="screen-center">{error || 'Загрузка комнаты...'}</main>;
  }

  return (
    <main className="room-layout">
      <header className="topbar room-topbar">
        <div>
          <p className="eyebrow">Комната</p>
          <h1>{room.title}</h1>
          <p className="muted">
            {presence.count || room.activeCount}/{room.maxParticipants} онлайн · роль {room.currentUserRole}
          </p>
        </div>
        <div className="room-actions">
          <button className="icon-button" onClick={copyInvite} title="Скопировать приглашение">
            <Clipboard size={18} />
          </button>
          {room.currentUserRole === 'owner' && (
            <button className="icon-button danger" onClick={deleteRoom} title="Удалить комнату">
              <Trash2 size={18} />
            </button>
          )}
          <button className="icon-button danger" onClick={leaveRoom} title="Выйти из комнаты">
            <LogOut size={18} />
          </button>
          <Link className="button compact" to="/dashboard">
            Комнаты
          </Link>
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}

      <section className="watch-grid">
        <div className="video-panel">
          <YouTubePlayer
            ref={playerRef}
            videoId={room.youtubeVideoId}
            onReady={() => setPlayerReady(true)}
            onStateChange={handlePlayerState}
          />

          <div className="control-bar">
            <button
              className="icon-button"
              onClick={() => sendSync('seek', currentTime - 10)}
              disabled={!canControl}
              title="Назад 10 секунд"
            >
              <StepBack size={18} />
            </button>
            <button
              className="icon-button primary"
              onClick={() => sendSync('play')}
              disabled={!canControl}
              title="Play"
            >
              <Play size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => sendSync('pause')}
              disabled={!canControl}
              title="Pause"
            >
              <Pause size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => sendSync('stop', 0)}
              disabled={!canControl}
              title="Stop"
            >
              <Square size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => sendSync('seek', currentTime + 10)}
              disabled={!canControl}
              title="Вперёд 10 секунд"
            >
              <StepForward size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => applyPlayerState(room.currentState)}
              title="Синхронизировать"
            >
              <RotateCcw size={18} />
            </button>
            <span className="time-badge">{formatSeconds(currentTime)}</span>
          </div>
        </div>

        <ChatPanel messages={messages} onSend={sendMessage} disabled={!socketConnected} />
      </section>
    </main>
  );
}
