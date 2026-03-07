-- Add source column to room_channels to distinguish Discord vs Telegram channels
ALTER TABLE room_channels
  ADD COLUMN source TEXT NOT NULL DEFAULT 'discord';

CREATE INDEX idx_room_channels_source ON room_channels(source);
