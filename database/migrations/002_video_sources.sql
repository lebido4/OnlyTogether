ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS video_provider TEXT NOT NULL DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_id TEXT,
  ADD COLUMN IF NOT EXISTS video_embed_url TEXT;

UPDATE rooms
   SET video_provider = COALESCE(video_provider, 'youtube'),
       video_url = COALESCE(video_url, youtube_url),
       video_id = COALESCE(video_id, youtube_video_id)
 WHERE video_url IS NULL
    OR video_id IS NULL
    OR video_provider IS NULL;
