-- Disable RSS sources that returned 403/404 and don't work
UPDATE sources SET active = false
WHERE type = 'rss' AND url IN (
  'https://news.gov.bc.ca/factsheets/rss',
  'https://innovation.ised-isde.canada.ca/s/cmm-rss?language=en',
  'https://open.alberta.ca/dataset.atom',
  'https://www.grantwatch.com/cat/25/canada-grants.html/rss',
  'https://ca.indeed.com/rss?q=farm+OR+ranch+OR+agriculture+OR+forestry&l=British+Columbia',
  'https://ca.indeed.com/rss?q=farm+OR+ranch+OR+agriculture+OR+trades&l=Alberta',
  'https://www.jobbank.gc.ca/jobsearch/jobsearch?fage=2&provid=BC&flg=E&sort=M&page=1&rss=1',
  'https://www.jobbank.gc.ca/jobsearch/jobsearch?fage=2&provid=AB&flg=E&sort=M&page=1&rss=1',
  'https://vancouver.craigslist.org/search/faa?format=rss',
  'https://kamloops.craigslist.org/search/faa?format=rss',
  'https://calgary.craigslist.org/search/faa?format=rss',
  'https://www.bchydro.com/news/press_centre.rss',
  'https://natural-resources.canada.ca/rss/news',
  'https://www.tourismkelowna.com/events/rss/',
  'https://www.kamloops.ca/feeds/events.xml',
  'https://skilledtradesbc.ca/feed',
  'https://www.bcchamber.org/feed/',
  'https://www.bcrealestateboard.com/wp-content/uploads/news.xml',
  'https://www.totabc.org/industry-news/'
);

-- Add verified working RSS sources

-- GRANTS
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('Futurpreneur Canada', 'https://www.futurpreneur.ca/en/feed/', 'rss', ARRAY['grants', 'jobs']::text[], 'national', 'core', '0 8 * * *', 'Canadian startup funding, mentoring, and business resources'),
  ('BC Rural Centre', 'https://www.bcruralcentre.org/feed/', 'rss', ARRAY['grants', 'land']::text[], 'bc', 'core', '0 8 * * *', 'BC rural community grants, food security, and land programs')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);

-- LAND
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('BC Farm & Ranch Realty', 'https://bcfarmandranch.com/feed/', 'rss', ARRAY['land']::text[], 'bc', 'candidate', '0 9 * * *', 'BC farm and ranch real estate listings and market news'),
  ('Country Life in BC', 'https://www.countrylifeinbc.com/feed/', 'rss', ARRAY['land', 'events']::text[], 'bc', 'core', '0 8 * * *', 'BC agriculture news, farm events, and rural community stories')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);

-- EVENTS / OPERATORS
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('Vernon Morning Star', 'https://www.vernonmorningstar.com/feed/', 'rss', ARRAY['events', 'operators']::text[], 'bc', 'candidate', '0 8 * * *', 'North Okanagan news, events, and business coverage')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);

-- INFRASTRUCTURE
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT * FROM (VALUES
  ('Small Housing BC', 'https://www.smallhousingbc.org/feed/', 'rss', ARRAY['infrastructure', 'land']::text[], 'bc', 'candidate', '0 9 * * 1', 'BC small housing policy, ADU advocacy, building innovations')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);
