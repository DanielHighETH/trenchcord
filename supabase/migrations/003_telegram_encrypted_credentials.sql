-- Encrypted Telegram API credentials (one row per user)
CREATE TABLE telegram_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_api_id TEXT NOT NULL,
  api_id_iv TEXT NOT NULL,
  api_id_tag TEXT NOT NULL,
  encrypted_api_hash TEXT NOT NULL,
  api_hash_iv TEXT NOT NULL,
  api_hash_tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_telegram_credentials_user ON telegram_credentials(user_id);

-- Encrypted Telegram session strings (one row per session, like discord_tokens)
CREATE TABLE telegram_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_session TEXT NOT NULL,
  session_iv TEXT NOT NULL,
  session_tag TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_sessions_user ON telegram_sessions(user_id);

-- RLS
ALTER TABLE telegram_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own telegram credentials"
  ON telegram_credentials FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own telegram sessions"
  ON telegram_sessions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER telegram_credentials_updated_at
  BEFORE UPDATE ON telegram_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Remove plaintext telegram fields from any existing user_configs settings
UPDATE user_configs
SET settings = settings - 'telegramApiId' - 'telegramApiHash' - 'telegramSessions'
WHERE settings ? 'telegramApiId'
   OR settings ? 'telegramApiHash'
   OR settings ? 'telegramSessions';
