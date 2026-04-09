-- Migration 014: Add scrape_method to sources for tiered scraping strategy
-- Values: 'auto' (try free first), 'static' (known-static HTML), 'js' (needs browser), 'firecrawl' (only Firecrawl)
-- 'disabled' = skip entirely (FB groups, Kijiji, etc that burn credits with no yield)

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS scrape_method TEXT NOT NULL DEFAULT 'auto'
  CHECK (scrape_method IN ('auto', 'static', 'js', 'firecrawl', 'disabled'));

-- Mark known JS-heavy sources that need real browsers as 'js'
-- These will fall back to Firecrawl only if key is available and not disabled
UPDATE sources SET scrape_method = 'js'
WHERE url LIKE '%realtor.ca%'
   OR url LIKE '%facebook.com%'
   OR url LIKE '%eventbrite%'
   OR url LIKE '%kijiji%'
   OR url LIKE '%wwoof.ca%'
   OR url LIKE '%bcpublicservice%'
   OR url LIKE '%jobbank.gc.ca%';

-- Mark known-static government / simple HTML sources explicitly
UPDATE sources SET scrape_method = 'static'
WHERE url LIKE '%gov.bc.ca%'
   OR url LIKE '%albertainnovates%'
   OR url LIKE '%farmlinksolutions%'
   OR url LIKE '%landquest%'
   OR url LIKE '%bchydro%'
   OR url LIKE '%fortisbc%'
   OR url LIKE '%bcassessment%'
   OR url LIKE '%bccassn%'
   OR url LIKE '%tourismkamloops%'
   OR url LIKE '%travelalberta%';
