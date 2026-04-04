-- Meetups / Events with RSVP
CREATE TABLE IF NOT EXISTS meetups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT NOT NULL,
  address TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  capacity INTEGER,
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL, -- Better Auth user.id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meetup_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id UUID NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(meetup_id, email)
);

CREATE INDEX idx_meetup_rsvps_meetup ON meetup_rsvps(meetup_id);
CREATE INDEX idx_meetups_date ON meetups(event_date);

-- Operator profile matchmaking fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS looking_for TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS offering TEXT;

-- Featured flag on items (for promoted land deals etc.)
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- Deal type for submissions
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_type_check;
ALTER TABLE submissions ADD CONSTRAINT submissions_type_check
  CHECK (type IN ('project', 'listing', 'event', 'source', 'tip', 'deal'));
