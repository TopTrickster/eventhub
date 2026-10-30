-- 003: the many-to-many between users and events.
-- One row is one taken seat. Free seats are counted from these rows, never stored.

CREATE TABLE registrations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT registrations_event_user_unique UNIQUE (event_id, user_id)
);
