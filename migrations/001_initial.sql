-- Portal.Place Intel — Initial Schema
-- Better Auth manages its own user/session/account tables.
-- We extend with our own tables for the Intel platform.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User preferences (extends Better Auth's user table)
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE, -- references Better Auth user.id
  preferences TEXT[] DEFAULT '{}',
  alert_categories TEXT[] DEFAULT '{}',
  digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('weekly', 'daily')),
  role TEXT NOT NULL DEFAULT 'subscriber' CHECK (role IN ('subscriber', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  unsubscribe_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  onboarded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sources for scraping
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('rss', 'html', 'api', 'manual', 'user_submitted')),
  categories TEXT[] DEFAULT '{}',
  region TEXT NOT NULL DEFAULT 'bc' CHECK (region IN ('bc', 'ab', 'national')),
  trust_level TEXT NOT NULL DEFAULT 'candidate' CHECK (trust_level IN ('core', 'candidate', 'probation')),
  scrape_frequency TEXT NOT NULL DEFAULT '0 6 * * *', -- daily at 6am
  yield_score REAL NOT NULL DEFAULT 0.5,
  active BOOLEAN NOT NULL DEFAULT true,
  submitted_by TEXT, -- Better Auth user.id
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Collected items from scrapers and submissions
CREATE TABLE IF NOT EXISTS collected_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT,
  category TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'bc',
  expires_at TIMESTAMPTZ,
  recency_score REAL NOT NULL DEFAULT 0,
  actionability_score REAL NOT NULL DEFAULT 0,
  uniqueness_score REAL NOT NULL DEFAULT 0,
  total_score REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'newsletter', 'feed', 'archived', 'expired')),
  submitted_by TEXT, -- Better Auth user.id, if user-submitted
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_collected_items_status ON collected_items(status);
CREATE INDEX idx_collected_items_category ON collected_items(category);
CREATE INDEX idx_collected_items_total_score ON collected_items(total_score DESC);
CREATE INDEX idx_collected_items_expires_at ON collected_items(expires_at) WHERE expires_at IS NOT NULL;

-- User submissions
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- Better Auth user.id
  type TEXT NOT NULL CHECK (type IN ('project', 'listing', 'event', 'source', 'tip')),
  title TEXT NOT NULL,
  description TEXT,
  url TEXT,
  category TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'bc',
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  moderator_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_submissions_status ON submissions(status);

-- Operator/project profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE, -- Better Auth user.id
  display_name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  category TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'bc',
  website_url TEXT,
  contact_method TEXT,
  visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Saved/bookmarked items
CREATE TABLE IF NOT EXISTS saved_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL, -- Better Auth user.id
  item_id UUID NOT NULL REFERENCES collected_items(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, item_id)
);

-- Newsletters
CREATE TABLE IF NOT EXISTS newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number INTEGER NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  engagement_question TEXT,
  html_body TEXT,
  sent_at TIMESTAMPTZ,
  item_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
