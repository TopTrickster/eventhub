-- 002: clubs and the events they publish.
-- The service layer also checks every rule below; the constraints are the last line of defence.

CREATE TABLE clubs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid        NOT NULL REFERENCES users (id),
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clubs_name_length CHECK (char_length(name) BETWEEN 3 AND 100),
  CONSTRAINT clubs_description_length CHECK (char_length(description) <= 1000)
);

CREATE TABLE events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id      uuid        NOT NULL REFERENCES clubs (id),
  organizer_id uuid        NOT NULL REFERENCES users (id),
  title        text        NOT NULL,
  description  text        NOT NULL,
  summary      text        NOT NULL DEFAULT '',
  category     text        NOT NULL,
  location     text        NOT NULL,
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  capacity     integer     NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_title_length CHECK (char_length(title) BETWEEN 3 AND 100),
  CONSTRAINT events_description_length CHECK (char_length(description) BETWEEN 10 AND 2000),
  CONSTRAINT events_summary_length CHECK (char_length(summary) <= 240),
  CONSTRAINT events_location_length CHECK (char_length(location) BETWEEN 3 AND 160),
  CONSTRAINT events_category_allowed CHECK (category IN ('technology', 'culture', 'sports', 'volunteering', 'other')),
  CONSTRAINT events_capacity_range CHECK (capacity BETWEEN 1 AND 500),
  CONSTRAINT events_ends_after_start CHECK (ends_at > starts_at)
);
