-- 004: indexes for the queries the app actually runs.
-- The UNIQUE constraints in 001-003 already index email, token_hash, (provider, provider_user_id)
-- and (event_id, user_id); registrations(event_id) is the leading column of that last one,
-- but is listed separately so the count-per-event query does not depend on it.

CREATE INDEX events_starts_at_idx ON events (starts_at);
CREATE INDEX events_club_id_idx ON events (club_id);
CREATE INDEX events_organizer_id_idx ON events (organizer_id);
CREATE INDEX registrations_event_id_idx ON registrations (event_id);
CREATE INDEX registrations_user_id_idx ON registrations (user_id);
CREATE INDEX clubs_owner_id_idx ON clubs (owner_id);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX oauth_accounts_user_id_idx ON oauth_accounts (user_id);
