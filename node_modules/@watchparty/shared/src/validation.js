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
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(400, 'INVALID_YOUTUBE_URL', 'YouTube URL is invalid');
  }

  const host = url.hostname.replace(/^www\./, '');
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

  return videoId;
}
