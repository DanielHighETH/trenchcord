-- Rooms can watch a whole Discord category. The channel list is resolved live
-- from the gateway, so only the subscription itself (and the channels the user
-- switched off) is stored.
--   [{ "guildId", "categoryId", "guildName", "categoryName", "excludedChannelIds": [] }]
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS categories JSONB NOT NULL DEFAULT '[]'::jsonb;
