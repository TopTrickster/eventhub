-- 001: people and the two ways they prove who they are.
-- One row in users per person; a Google identity is attached to that row, never a second user.

CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  display_name  text        NOT NULL,
  -- Argon2id hash with its salt; NULL for a person who has only signed in with Google so far.
  password_hash text,
  role          text        NOT NULL DEFAULT 'member',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email),
  CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email))),
  CONSTRAINT users_role_allowed CHECK (role IN ('member', 'organizer')),
  CONSTRAINT users_display_name_length CHECK (char_length(display_name) BETWEEN 1 AND 100)
);

CREATE TABLE oauth_accounts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider         text        NOT NULL,
  provider_user_id text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_accounts_identity_unique UNIQUE (provider, provider_user_id)
);

-- The browser and the MCP server hold the raw token; the database only ever sees its hash.
CREATE TABLE sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text        NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash)
);
