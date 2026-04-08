-- Waitlist for Intel launch
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  source TEXT NOT NULL DEFAULT 'email' CHECK (source IN ('email', 'google')),
  user_id TEXT,
  referrer TEXT,
  notified BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_notified ON waitlist(notified) WHERE notified = false;
