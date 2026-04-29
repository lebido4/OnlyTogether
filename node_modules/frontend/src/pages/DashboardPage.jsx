import { Copy, LogOut, Plus, Trash2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getApiError } from '../api.js';
import { useAuth } from '../state/AuthContext.jsx';

function extractInviteCode(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/\/invite\/([^/?#]+)/);
  return match?.[1] ?? trimmed;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [createForm, setCreateForm] = useState({
    title: '',
    maxParticipants: 8,
    youtubeUrl: ''
  });
  const [invite, setInvite] = useState('');
  const [error, setError] = useState('');
  const [deletingRoomId, setDeletingRoomId] = useState('');

  async function loadRooms() {
    const response = await api.get('/rooms');
    setRooms(response.data.rooms);
  }

  useEffect(() => {
    loadRooms().catch((requestError) => setError(getApiError(requestError)));
  }, []);

  async function createRoom(event) {
    event.preventDefault();
    setError('');

    try {
      const response = await api.post('/rooms', {
        title: createForm.title,
        maxParticipants: Number(createForm.maxParticipants),
        youtubeUrl: createForm.youtubeUrl
      });
      navigate(`/rooms/${response.data.room.id}`);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  async function joinInvite(event) {
    event.preventDefault();
    setError('');
    const code = extractInviteCode(invite);

    try {
      const response = await api.post(`/rooms/invite/${code}/join`);
      navigate(`/rooms/${response.data.room.id}`);
    } catch (requestError) {
      setError(getApiError(requestError));
    }
  }

  function copyInvite(room) {
    navigator.clipboard?.writeText(`${window.location.origin}${room.inviteUrl}`);
  }

  async function deleteRoom(room) {
    if (!window.confirm(`Удалить комнату "${room.title}"? Сообщения и участники тоже будут удалены.`)) {
      return;
    }

    setError('');
    setDeletingRoomId(room.id);

    try {
      await api.delete(`/rooms/${room.id}`);
      setRooms((current) => current.filter((item) => item.id !== room.id));
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setDeletingRoomId('');
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Watch Party</p>
          <h1>Комнаты</h1>
        </div>
        <div className="user-box">
          <span>{user?.username}</span>
          <button className="icon-button" onClick={logout} title="Выйти">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {error && <p className="error-text">{error}</p>}

      <section className="dashboard-grid">
        <form className="panel stack" onSubmit={createRoom}>
          <div className="panel-header">
            <h2>Новая комната</h2>
            <Plus size={20} />
          </div>
          <label>
            Название
            <input
              value={createForm.title}
              onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))}
              required
              minLength={2}
              maxLength={120}
            />
          </label>
          <label>
            Лимит участников
            <input
              type="number"
              min={2}
              max={50}
              value={createForm.maxParticipants}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, maxParticipants: event.target.value }))
              }
            />
          </label>
          <label>
            YouTube URL
            <input
              value={createForm.youtubeUrl}
              onChange={(event) =>
                setCreateForm((current) => ({ ...current, youtubeUrl: event.target.value }))
              }
              placeholder="https://www.youtube.com/watch?v=..."
              required
            />
          </label>
          <button className="button primary" type="submit">
            <Plus size={18} />
            Создать
          </button>
        </form>

        <form className="panel stack" onSubmit={joinInvite}>
          <div className="panel-header">
            <h2>Invite</h2>
            <Users size={20} />
          </div>
          <label>
            Код или ссылка
            <input
              value={invite}
              onChange={(event) => setInvite(event.target.value)}
              placeholder="http://localhost:5173/invite/..."
              required
            />
          </label>
          <button className="button secondary" type="submit">
            <Users size={18} />
            Присоединиться
          </button>
        </form>
      </section>

      <section className="rooms-list">
        <div className="section-title">
          <h2>Комнаты, которыми я владею</h2>
        </div>

        {rooms.length === 0 && <p className="muted">Пока нет комнат, которыми вы владеете.</p>}

        <div className="room-cards">
          {rooms.map((room) => (
            <article className="room-card" key={room.id}>
              <div>
                <h3>{room.title}</h3>
                <p>
                  {room.activeCount}/{room.maxParticipants} участников · {room.currentUserRole}
                </p>
              </div>
              <div className="card-actions">
                <button className="icon-button" type="button" onClick={() => copyInvite(room)} title="Скопировать invite">
                  <Copy size={18} />
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => deleteRoom(room)}
                  disabled={deletingRoomId === room.id}
                  title="Удалить комнату"
                >
                  <Trash2 size={18} />
                </button>
                <Link className="button compact" to={`/rooms/${room.id}`}>
                  Открыть
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
