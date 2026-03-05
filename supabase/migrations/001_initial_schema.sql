-- Trenchcord multi-user schema
-- All tables use RLS so each user can only access their own data.

-- User configuration (mirrors AppConfig minus discordTokens and rooms)
CREATE TABLE user_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Encrypted Discord tokens
CREATE TABLE discord_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  token_mask TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discord_tokens_user ON discord_tokens(user_id);

-- Rooms
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  highlighted_users TEXT[] NOT NULL DEFAULT '{}',
  filtered_users TEXT[] NOT NULL DEFAULT '{}',
  filter_enabled BOOLEAN NOT NULL DEFAULT false,
  keyword_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlight_mode TEXT NOT NULL DEFAULT 'background',
  highlighted_user_colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rooms_user ON rooms(user_id);

-- Channels belonging to a room
CREATE TABLE room_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  guild_id TEXT,
  channel_id TEXT NOT NULL,
  guild_name TEXT,
  channel_name TEXT,
  disable_embeds BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_room_channels_room ON room_channels(room_id);
CREATE INDEX idx_room_channels_user ON room_channels(user_id);
CREATE INDEX idx_room_channels_channel ON room_channels(channel_id);

-- Detected contracts
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  chain TEXT NOT NULL,
  evm_chain TEXT,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  guild_id TEXT,
  guild_name TEXT,
  room_ids TEXT[] NOT NULL DEFAULT '{}',
  message_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  first_seen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_user ON contracts(user_id);
CREATE INDEX idx_contracts_address ON contracts(address);
CREATE INDEX idx_contracts_timestamp ON contracts(user_id, timestamp DESC);

-- Sound file references (stored in Supabase Storage)
CREATE TABLE user_sounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sound_type TEXT NOT NULL,
  channel_id TEXT,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_sounds_user ON user_sounds(user_id);

-- =============================================================
-- Row Level Security
-- =============================================================

ALTER TABLE user_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE discord_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sounds ENABLE ROW LEVEL SECURITY;

-- user_configs
CREATE POLICY "Users manage own config"
  ON user_configs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- discord_tokens
CREATE POLICY "Users manage own tokens"
  ON discord_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- rooms
CREATE POLICY "Users manage own rooms"
  ON rooms FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- room_channels
CREATE POLICY "Users manage own room channels"
  ON room_channels FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- contracts
CREATE POLICY "Users manage own contracts"
  ON contracts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_sounds
CREATE POLICY "Users manage own sounds"
  ON user_sounds FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================
-- Auto-update updated_at timestamps
-- =============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_configs_updated_at
  BEFORE UPDATE ON user_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
