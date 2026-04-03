-- Source health tracking
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_scraped_at TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_yield INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS scrape_errors INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;

-- AI enrichment fields on items
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS ai_actionability TEXT;
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS ai_score REAL;
ALTER TABLE collected_items ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- Index for unenriched items
CREATE INDEX IF NOT EXISTS idx_collected_items_enriched ON collected_items(enriched_at) WHERE enriched_at IS NULL AND status = 'pending';
