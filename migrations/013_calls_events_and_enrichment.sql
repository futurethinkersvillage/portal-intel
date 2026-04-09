-- AI-rewritten headlines (better, more actionable than raw scraped titles)
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS ai_headline TEXT;

-- Land-specific detail fields (populated by enrichment for category='land' items)
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS details JSONB;

-- Soft interest / pledging for land listings
CREATE TABLE IF NOT EXISTS item_interest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES collected_items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  pledge_amount INTEGER,
  timeline TEXT CHECK (timeline IN ('now', '3m', '6m', '12m')),
  contact_consent BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_item_interest_item ON item_interest(item_id);
CREATE INDEX IF NOT EXISTS idx_item_interest_user ON item_interest(user_id);

-- Events / meetups: past event flag + external URL for Facebook events
ALTER TABLE meetups ADD COLUMN IF NOT EXISTS event_url TEXT;
ALTER TABLE meetups ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE meetups ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal'
  CHECK (source IN ('internal', 'facebook', 'meetup.com', 'eventbrite', 'scraped'));

-- Calls table: separate from meetups, synced from Zoom (and other sources)
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoom_meeting_id TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  host_name TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER,
  join_url TEXT,
  registration_url TEXT,
  recording_url TEXT,
  recording_password TEXT,
  transcript TEXT,
  summary TEXT,
  categories TEXT[] DEFAULT '{}',
  is_past BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT true,
  source TEXT NOT NULL DEFAULT 'zoom' CHECK (source IN ('zoom', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calls_scheduled ON calls(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_is_past ON calls(is_past);
CREATE INDEX IF NOT EXISTS idx_calls_zoom_id ON calls(zoom_meeting_id) WHERE zoom_meeting_id IS NOT NULL;
