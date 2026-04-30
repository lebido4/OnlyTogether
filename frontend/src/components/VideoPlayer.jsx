import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

let youtubeApiPromise;
let vkApiPromise;

function loadYouTubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve(window.YT);
      };

      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);
    });
  }

  return youtubeApiPromise;
}

function loadVkApi() {
  if (window.VK?.VideoPlayer) {
    return Promise.resolve(window.VK);
  }

  if (!vkApiPromise) {
    vkApiPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://vk.com/js/api/videoplayer.js';
      script.async = true;
      script.onload = () => resolve(window.VK);
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  return vkApiPromise;
}

function getHostPageOrigin() {
  const configuredOrigin = import.meta.env.VITE_PUBLIC_ORIGIN?.trim();
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      return window.location.origin;
    }
  }

  return window.location.origin;
}

function normalizeRutubeState(state) {
  const value = String(state ?? '').toLowerCase();
  if (['playing', 'play'].includes(value)) {
    return 'playing';
  }
  if (['paused', 'pause'].includes(value)) {
    return 'paused';
  }
  if (['stopped', 'stop'].includes(value)) {
    return 'stopped';
  }
  if (['complete', 'completed', 'ended', 'end'].includes(value)) {
    return 'ended';
  }
  return null;
}

function readTime(value) {
  const time = Number(value?.time ?? value?.currentTime ?? value);
  return Number.isFinite(time) ? Math.max(0, time) : null;
}

function createIframe(container, src, title) {
  container.innerHTML = '';

  const iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = title;
  iframe.className = 'embed-frame';
  iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture; screen-wake-lock';
  iframe.allowFullscreen = true;
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';

  container.appendChild(iframe);
  return iframe;
}

const VideoPlayer = forwardRef(function VideoPlayer(
  { provider, videoId, embedUrl, onReady, onStateChange },
  ref
) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const currentTimeRef = useRef(0);
  const readySentRef = useRef(false);
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onReadyRef.current = onReady;
    onStateChangeRef.current = onStateChange;
  }, [onReady, onStateChange]);

  function notifyReady() {
    if (!readySentRef.current) {
      readySentRef.current = true;
      onReadyRef.current?.();
    }
  }

  function emitState(status) {
    if (status) {
      onStateChangeRef.current?.({ status });
    }
  }

  useImperativeHandle(ref, () => ({
    play: () => controllerRef.current?.play?.(),
    pause: () => controllerRef.current?.pause?.(),
    stop: () => controllerRef.current?.stop?.(),
    seekTo: (seconds) => controllerRef.current?.seekTo?.(Math.max(0, seconds)),
    setVolume: (volume) => controllerRef.current?.setVolume?.(volume),
    getCurrentTime: () => controllerRef.current?.getCurrentTime?.() ?? currentTimeRef.current
  }));

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    readySentRef.current = false;
    currentTimeRef.current = 0;
    controllerRef.current = null;

    async function mountYouTube() {
      const YT = await loadYouTubeApi();
      if (disposed || !containerRef.current) {
        return;
      }

      const mount = document.createElement('div');
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(mount);

      const player = new YT.Player(mount, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          enablejsapi: 1,
          playsinline: 1,
          rel: 0,
          origin: getHostPageOrigin()
        },
        events: {
          onReady: () => notifyReady(),
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              emitState('playing');
            }
            if (event.data === YT.PlayerState.PAUSED) {
              emitState('paused');
            }
            if (event.data === YT.PlayerState.ENDED) {
              emitState('ended');
            }
          }
        }
      });

      controllerRef.current = {
        play: () => player.playVideo(),
        pause: () => player.pauseVideo(),
        stop: () => player.stopVideo(),
        seekTo: (seconds) => player.seekTo(seconds, true),
        setVolume: (volume) => player.setVolume(volume),
        getCurrentTime: () => player.getCurrentTime?.() ?? 0
      };
      cleanup = () => player.destroy?.();
    }

    function mountRutube() {
      if (!containerRef.current || !embedUrl) {
        return;
      }

      const iframe = createIframe(containerRef.current, embedUrl, 'RUTUBE player');

      function post(type, data = {}) {
        iframe.contentWindow?.postMessage(JSON.stringify({ type, data }), '*');
      }

      function onMessage(event) {
        if (!String(event.origin).includes('rutube.ru')) {
          return;
        }

        let message;
        try {
          message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        } catch {
          return;
        }
        if (message.type === 'player:ready') {
          notifyReady();
        }
        if (message.type === 'player:changeState') {
          emitState(normalizeRutubeState(message.data?.state));
        }
        if (message.type === 'player:currentTime') {
          const time = readTime(message.data);
          if (time !== null) {
            currentTimeRef.current = time;
          }
        }
        if (message.type === 'player:playComplete') {
          emitState('ended');
        }
      }

      window.addEventListener('message', onMessage);
      iframe.addEventListener('load', notifyReady);

      controllerRef.current = {
        play: () => post('player:play'),
        pause: () => post('player:pause'),
        stop: () => post('player:stop'),
        seekTo: (seconds) => post('player:setCurrentTime', { time: seconds }),
        setVolume: (volume) => post('player:setVolume', { volume: Math.max(0, Math.min(1, volume / 100)) }),
        getCurrentTime: () => currentTimeRef.current
      };
      cleanup = () => {
        window.removeEventListener('message', onMessage);
      };
    }

    async function mountVk() {
      if (!containerRef.current || !embedUrl) {
        return;
      }

      const iframe = createIframe(containerRef.current, embedUrl, 'VK Video player');
      let player = null;
      let interval = null;

      function resolveCurrentTime(value) {
        if (typeof value?.then === 'function') {
          value.then(resolveCurrentTime).catch(() => {});
          return;
        }
        const time = readTime(value);
        if (time !== null) {
          currentTimeRef.current = time;
        }
      }

      function call(names, ...args) {
        for (const name of names) {
          if (typeof player?.[name] === 'function') {
            return player[name](...args);
          }
        }
        return undefined;
      }

      function bind(names, handler) {
        for (const name of names) {
          player?.on?.(name, handler);
        }
      }

      try {
        const VK = await loadVkApi();
        if (disposed) {
          return;
        }

        player = VK.VideoPlayer(iframe);
        bind(['started', 'resumed', 'play', 'playing'], () => emitState('playing'));
        bind(['paused', 'pause'], () => emitState('paused'));
        bind(['ended', 'end', 'finished'], () => emitState('ended'));
        bind(['timeupdate', 'timeUpdate', 'progress'], (event) => resolveCurrentTime(event));

        interval = window.setInterval(() => {
          resolveCurrentTime(call(['getCurrentTime', 'currentTime', 'getTime']));
        }, 1000);

        controllerRef.current = {
          play: () => call(['play']),
          pause: () => call(['pause']),
          stop: () => {
            call(['pause']);
            call(['seek', 'seekTo', 'setCurrentTime'], 0);
          },
          seekTo: (seconds) => call(['seek', 'seekTo', 'setCurrentTime'], seconds),
          setVolume: (volume) => call(['setVolume'], volume),
          getCurrentTime: () => currentTimeRef.current
        };
        notifyReady();
      } catch {
        controllerRef.current = {
          play: () => {},
          pause: () => {},
          stop: () => {},
          seekTo: () => {},
          setVolume: () => {},
          getCurrentTime: () => currentTimeRef.current
        };
        iframe.addEventListener('load', notifyReady);
      }

      cleanup = () => {
        if (interval) {
          window.clearInterval(interval);
        }
      };
    }

    if (provider === 'youtube') {
      mountYouTube();
    } else if (provider === 'rutube') {
      mountRutube();
    } else if (provider === 'vk') {
      mountVk();
    }

    return () => {
      disposed = true;
      cleanup();
      controllerRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [provider, videoId, embedUrl]);

  return <div className="video-frame" ref={containerRef} />;
});

export default VideoPlayer;
