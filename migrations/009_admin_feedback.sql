-- Admin feedback system for learning what's high-value

-- Item-level feedback: vote + comment (comment required with every vote)
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS admin_vote SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS admin_comment TEXT;

-- Pinned items support
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Source-level feedback: rating
ALTER TABLE sources ADD COLUMN IF NOT EXISTS admin_rating SMALLINT NOT NULL DEFAULT 0;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_collected_items_admin_vote ON collected_items(admin_vote) WHERE admin_vote != 0;
CREATE INDEX IF NOT EXISTS idx_collected_items_pinned ON collected_items(pinned_at) WHERE pinned_at IS NOT NULL;
