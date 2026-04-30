import { AppError } from './errors.js';

export function requireString(body, field, { min = 1, max = 255 } = {}) {
  const value = body?.[field];
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `Field "${field}" must be a string from ${min} to ${max} chars`);
  }

  return value.trim();
}

export function optionalString(body, field, { max = 255 } = {}) {
  const value = body?.[field];
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `Field "${field}" must be a string up to ${max} chars`);
  }

  return value.trim();
}

export function requireInteger(body, field, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(body?.[field]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError(400, 'VALIDATION_ERROR', `Field "${field}" must be an integer from ${min} to ${max}`);
  }

  return value;
}

export function validateEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Email is invalid');
  }

  return email.toLowerCase();
}

export function extractYouTubeVideoId(rawUrl) {
  return parseVideoSource(rawUrl).videoId;
}

function normalizeHost(url) {
  return url.hostname.replace(/^www\./, '').toLowerCase();
}

function extractIframeSrc(value) {
  const match = value.match(/\bsrc=["']([^"']+)["']/i);
  return match?.[1]?.replaceAll('&amp;', '&') ?? value;
}

function appendQueryParam(url, key, value) {
  if (!url.searchParams.has(key)) {
    url.searchParams.set(key, value);
  }
}

function parseYouTubeSource(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(400, 'INVALID_YOUTUBE_URL', 'YouTube URL is invalid');
  }

  const host = normalizeHost(url);
  let videoId = null;

  if (host === 'youtu.be') {
    videoId = url.pathname.split('/').filter(Boolean)[0];
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else {
      const [, kind, id] = url.pathname.split('/');
      if (['embed', 'shorts', 'live'].includes(kind)) {
        videoId = id;
      }
    }
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    throw new AppError(400, 'UNSUPPORTED_VIDEO_URL', 'Only YouTube video URLs are supported');
  }

  const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
  embedUrl.searchParams.set('enablejsapi', '1');

  return {
    provider: 'youtube',
    providerLabel: 'YouTube',
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: embedUrl.toString()
  };
}

function parseRutubeSource(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(400, 'INVALID_RUTUBE_URL', 'RUTUBE URL is invalid');
  }

  const host = normalizeHost(url);
  if (host !== 'rutube.ru') {
    return null;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  let videoId = null;

  if (parts[0] === 'play' && parts[1] === 'embed') {
    videoId = parts[2];
  } else if (parts[0] === 'video' && parts[1] === 'private') {
    videoId = parts[2];
  } else if (parts[0] === 'video' || parts[0] === 'shorts') {
    videoId = parts[1];
  }

  if (!videoId || !/^[a-zA-Z0-9_-]{8,80}$/.test(videoId)) {
    throw new AppError(400, 'UNSUPPORTED_VIDEO_URL', 'RUTUBE video URL is not supported');
  }

  const privateKey = url.searchParams.get('p');
  const embedUrl = new URL(`https://rutube.ru/play/embed/${videoId}${privateKey ? '/' : ''}`);
  if (privateKey) {
    embedUrl.searchParams.set('p', privateKey);
  }

  return {
    provider: 'rutube',
    providerLabel: 'RUTUBE',
    videoId,
    videoUrl: privateKey
      ? `https://rutube.ru/video/private/${videoId}/?p=${privateKey}`
      : `https://rutube.ru/video/${videoId}/`,
    embedUrl: embedUrl.toString()
  };
}

function parseVkSource(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(400, 'INVALID_VK_VIDEO_URL', 'VK Video URL is invalid');
  }

  const host = normalizeHost(url);
  if (!['vk.com', 'vk.ru', 'vkvideo.ru'].includes(host)) {
    return null;
  }

  let ownerId = url.searchParams.get('oid');
  let id = url.searchParams.get('id');
  const hash = url.searchParams.get('hash');
  const hd = url.searchParams.get('hd') ?? '2';

  if (!ownerId || !id) {
    const match = rawUrl.match(/video(-?\d+)_(\d+)/i);
    ownerId = match?.[1] ?? null;
    id = match?.[2] ?? null;
  }

  if (!ownerId || !id || !/^-?\d+$/.test(ownerId) || !/^\d+$/.test(id)) {
    throw new AppError(400, 'UNSUPPORTED_VIDEO_URL', 'VK Video URL is not supported');
  }

  const embedUrl = new URL('https://vk.com/video_ext.php');
  embedUrl.searchParams.set('oid', ownerId);
  embedUrl.searchParams.set('id', id);
  if (hash) {
    embedUrl.searchParams.set('hash', hash);
  }
  embedUrl.searchParams.set('hd', hd);
  appendQueryParam(embedUrl, 'js_api', '1');

  return {
    provider: 'vk',
    providerLabel: 'VK Video',
    videoId: `${ownerId}_${id}`,
    videoUrl: `https://vk.com/video${ownerId}_${id}`,
    embedUrl: embedUrl.toString()
  };
}

export function parseVideoSource(rawValue) {
  const rawUrl = extractIframeSrc(String(rawValue ?? '').trim());
  if (!rawUrl) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Video URL is required');
  }

  let url;
  try {
    url = new URL(rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl);
  } catch {
    throw new AppError(400, 'INVALID_VIDEO_URL', 'Video URL is invalid');
  }

  const host = normalizeHost(url);
  if (['youtu.be', 'youtube.com', 'm.youtube.com'].includes(host)) {
    return parseYouTubeSource(url.toString());
  }

  const rutube = parseRutubeSource(url.toString());
  if (rutube) {
    return rutube;
  }

  const vk = parseVkSource(url.toString());
  if (vk) {
    return vk;
  }

  throw new AppError(
    400,
    'UNSUPPORTED_VIDEO_URL',
    'Supported video services are YouTube, VK Video and RUTUBE'
  );
}
