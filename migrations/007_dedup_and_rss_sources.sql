-- Deduplicate sources: keep lowest id per url, delete rest
DELETE FROM sources
WHERE id NOT IN (
  SELECT MIN(id) FROM sources GROUP BY url
);

-- Reset consecutive_failures on all sources (Firecrawl format bug was the cause)
UPDATE sources SET consecutive_failures = 0 WHERE consecutive_failures > 0;

-- Add reliable RSS sources for categories that lack content
-- These are actual RSS/Atom feeds that won't need Firecrawl

-- GRANTS: government grant/funding RSS feeds
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('BC Gov News - Jobs & Economy', 'https://news.gov.bc.ca/factsheets/rss', 'rss', ARRAY['grants', 'jobs']::text[], 'bc', 'core', '0 7 * * *', 'BC government news feed — grants, economic programs'),
  ('Innovation Canada', 'https://innovation.ised-isde.canada.ca/s/cmm-rss?language=en', 'rss', ARRAY['grants']::text[], 'national', 'core', '0 8 * * *', 'Federal innovation and business funding programs'),
  ('Alberta Open Data News', 'https://open.alberta.ca/dataset.atom', 'rss', ARRAY['grants', 'infrastructure']::text[], 'ab', 'candidate', '0 8 * * *', 'Alberta open data and government releases'),
  ('GrantWatch Canada', 'https://www.grantwatch.com/cat/25/canada-grants.html/rss', 'rss', ARRAY['grants']::text[], 'national', 'candidate', '0 9 * * *', 'Grant listings for Canadian nonprofits and businesses')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);

-- JOBS: job board RSS feeds
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('Indeed BC Rural Jobs', 'https://ca.indeed.com/rss?q=farm+OR+ranch+OR+agriculture+OR+forestry&l=British+Columbia', 'rss', ARRAY['jobs']::text[], 'bc', 'candidate', '0 */4 * * *', 'Indeed BC rural/agricultural job listings'),
  ('Indeed AB Rural Jobs', 'https://ca.indeed.com/rss?q=farm+OR+ranch+OR+agriculture+OR+trades&l=Alberta', 'rss', ARRAY['jobs']::text[], 'ab', 'candidate', '0 */4 * * *', 'Indeed Alberta rural/trade job listings'),
  ('Job Bank BC', 'https://www.jobbank.gc.ca/jobsearch/jobsearch?fage=2&provid=BC&flg=E&sort=M&page=1&rss=1', 'rss', ARRAY['jobs']::text[], 'bc', 'core', '0 7 * * *', 'Government of Canada Job Bank — BC listings RSS'),
  ('Job Bank AB', 'https://www.jobbank.gc.ca/jobsearch/jobsearch?fage=2&provid=AB&flg=E&sort=M&page=1&rss=1', 'rss', ARRAY['jobs']::text[], 'ab', 'core', '0 7 * * *', 'Government of Canada Job Bank — AB listings RSS')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);

-- LAND: property/real estate RSS feeds
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('Craigslist BC Farm & Garden', 'https://vancouver.craigslist.org/search/faa?format=rss', 'rss', ARRAY['land']::text[], 'bc', 'candidate', '0 */6 * * *', 'Craigslist Vancouver farm and garden listings'),
  ('Craigslist Kamloops Farm', 'https://kamloops.craigslist.org/search/faa?format=rss', 'rss', ARRAY['land']::text[], 'bc', 'candidate', '0 */6 * * *', 'Craigslist Kamloops farm and garden listings'),
  ('Craigslist Calgary Farm', 'https://calgary.craigslist.org/search/faa?format=rss', 'rss', ARRAY['land']::text[], 'ab', 'candidate', '0 */6 * * *', 'Craigslist Calgary farm and garden listings'),
  ('BC Real Estate Board News', 'https://www.bcrea.bc.ca/feed/', 'rss', ARRAY['land']::text[], 'bc', 'core', '0 9 * * *', 'BC Real Estate Association news and market reports')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);

-- INFRASTRUCTURE: energy/building RSS feeds
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('BC Hydro News', 'https://www.bchydro.com/news/press_centre.rss', 'rss', ARRAY['infrastructure']::text[], 'bc', 'core', '0 8 * * *', 'BC Hydro press releases — power projects, outages, programs'),
  ('Natural Resources Canada News', 'https://natural-resources.canada.ca/rss/news', 'rss', ARRAY['infrastructure', 'grants']::text[], 'national', 'core', '0 8 * * *', 'NRCan news — energy efficiency, clean energy programs'),
  ('Canadian Home Builders RSS', 'https://www.chba.ca/feed/', 'rss', ARRAY['infrastructure', 'operators']::text[], 'national', 'candidate', '0 9 * * *', 'CHBA news — building codes, housing programs')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);

-- EVENTS: community/regional event RSS feeds
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('Tourism Kelowna Events', 'https://www.tourismkelowna.com/events/rss/', 'rss', ARRAY['events']::text[], 'bc', 'candidate', '0 8 * * *', 'Kelowna area events and festivals'),
  ('City of Kamloops Events', 'https://www.kamloops.ca/feeds/events.xml', 'rss', ARRAY['events']::text[], 'bc', 'core', '0 8 * * *', 'City of Kamloops official event calendar')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);

-- OPERATORS: trades/industry RSS feeds
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('SkilledTradesBC News', 'https://skilledtradesbc.ca/feed', 'rss', ARRAY['operators', 'jobs']::text[], 'bc', 'core', '0 9 * * *', 'BC skilled trades news, apprenticeships, certifications'),
  ('BC Chamber of Commerce', 'https://www.bcchamber.org/feed/', 'rss', ARRAY['operators', 'grants']::text[], 'bc', 'core', '0 9 * * *', 'BC Chamber of Commerce news and policy updates')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);
