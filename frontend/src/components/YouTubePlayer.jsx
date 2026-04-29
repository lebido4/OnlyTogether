import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

let youtubeApiPromise;

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

const YouTubePlayer = forwardRef(function YouTubePlayer({ videoId, onReady, onStateChange }, ref) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);

  useEffect(() => {
    onReadyRef.current = onReady;
    onStateChangeRef.current = onStateChange;
  }, [onReady, onStateChange]);

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.playVideo(),
    pause: () => playerRef.current?.pauseVideo(),
    stop: () => playerRef.current?.stopVideo(),
    seekTo: (seconds) => playerRef.current?.seekTo(Math.max(0, seconds), true),
    setVolume: (volume) => playerRef.current?.setVolume(volume),
    getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0
  }));

  useEffect(() => {
    let disposed = false;

    async function createPlayer() {
      const YT = await loadYouTubeApi();
      if (disposed || !containerRef.current) {
        return;
      }

      playerRef.current?.destroy?.();
      playerRef.current = new YT.Player(containerRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          rel: 0,
          modestbranding: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => onReadyRef.current?.(),
          onStateChange: (event) => onStateChangeRef.current?.(event.data)
        }
      });
    }

    createPlayer();

    return () => {
      disposed = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [videoId]);

  return <div className="youtube-frame" ref={containerRef} />;
});

export default YouTubePlayer;
