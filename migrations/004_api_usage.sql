-- API usage tracking for cost calculator
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,        -- 'anthropic', 'firecrawl', 'resend', 'brave'
  operation TEXT NOT NULL,      -- 'enrichment', 'source-search', 'editorial', 'scrape', 'email', 'email-batch', 'web-search'
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  units INTEGER DEFAULT 1,      -- generic count: pages scraped, emails sent, searches run
  cost_cents REAL DEFAULT 0,    -- estimated cost in cents
  metadata JSONB,               -- optional extra context (model, item count, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_usage_service ON api_usage(service);
CREATE INDEX idx_api_usage_created_at ON api_usage(created_at);
