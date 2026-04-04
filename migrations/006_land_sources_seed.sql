-- Seed rural land listing sources for BC & Alberta
-- Use INSERT ... SELECT ... WHERE NOT EXISTS to avoid duplicate URL issues
INSERT INTO sources (name, url, type, categories, region, trust_level, scrape_frequency, notes)
SELECT name, url, type, categories, region, trust_level, scrape_frequency, notes FROM (VALUES
  ('AcreageSearch BC', 'https://www.acreagesearch.com/bc-acreages-for-sale', 'html', ARRAY['land']::text[], 'bc', 'candidate', '0 8 * * *', 'BC rural acreage listings'),
  ('AcreageSearch AB', 'https://www.acreagesearch.com/alberta-acreages-for-sale', 'html', ARRAY['land']::text[], 'ab', 'candidate', '0 8 * * *', 'Alberta rural acreage listings'),
  ('Point2Homes BC Farms', 'https://www.point2homes.com/CA/Real-Estate-Listings/BC/Farm.html', 'html', ARRAY['land']::text[], 'bc', 'candidate', '0 9 * * *', 'BC farm listings'),
  ('Point2Homes AB Farms', 'https://www.point2homes.com/CA/Real-Estate-Listings/AB/Farm.html', 'html', ARRAY['land']::text[], 'ab', 'candidate', '0 9 * * *', 'Alberta farm listings'),
  ('Kijiji BC Farm & Land', 'https://www.kijiji.ca/b-farms-acreages/british-columbia/c649l9004', 'html', ARRAY['land']::text[], 'bc', 'candidate', '0 */6 * * *', 'Kijiji BC farm and land listings'),
  ('Kijiji AB Farm & Land', 'https://www.kijiji.ca/b-farms-acreages/alberta/c649l9003', 'html', ARRAY['land']::text[], 'ab', 'candidate', '0 */6 * * *', 'Kijiji AB farm and land listings'),
  ('FCC Farmland Values BC', 'https://www.fcc-fac.ca/en/ag-knowledge/land/farmland-values.html', 'html', ARRAY['land', 'grants']::text[], 'bc', 'candidate', '0 10 * * 1', 'Farm Credit Canada farmland values and reports'),
  ('BC Gov Surplus Land', 'https://www2.gov.bc.ca/gov/content/governments/services-for-government/bc-bid-resources/opportunities/surplus-land', 'html', ARRAY['land']::text[], 'bc', 'candidate', '0 7 * * *', 'BC government surplus land sales'),
  ('BC Agricultural Land Commission', 'https://www.alc.gov.bc.ca/news/', 'html', ARRAY['land', 'grants']::text[], 'bc', 'core', '0 9 * * *', 'ALC news — ALR policy, exclusions, decisions'),
  ('Realtor.ca BC Rural', 'https://www.realtor.ca/map#ZoomLevel=8&Center=53.726669,-127.647621&LatitudeMax=59.99&LongitudeMax=-114.03&LatitudeMin=48.30&LongitudeMin=-139.06&view=List&PropertyTypeGroupID=1&PropertySearchTypeId=2&TransactionTypeId=2', 'html', ARRAY['land']::text[], 'bc', 'candidate', '0 8 * * *', 'Realtor.ca BC rural/farm property filter'),
  ('BC Investment Agriculture Foundation', 'https://www.iafbc.ca/programs/', 'html', ARRAY['grants', 'land']::text[], 'bc', 'core', '0 9 * * 1', 'BC agri-business grants and programs'),
  ('Canada Agricultural Partnership BC', 'https://www2.gov.bc.ca/gov/content/industry/agriculture-seafood/canadian-agricultural-partnership', 'html', ARRAY['grants']::text[], 'bc', 'core', '0 9 * * 1', 'Federal-provincial ag funding programs'),
  ('ATIRA BC Homesteading Groups RSS', 'https://www.facebook.com/groups/bchomesteading/feed', 'html', ARRAY['land', 'events']::text[], 'bc', 'candidate', '0 */12 * * *', 'BC homesteading community listings'),
  ('Thompson Okanagan Tourism', 'https://www.totabc.org/industry-news/', 'rss', ARRAY['events', 'land']::text[], 'bc', 'candidate', '0 8 * * *', 'Thompson Okanagan tourism industry news'),
  ('Interior BC Real Estate RSS', 'https://www.bcrealestateboard.com/wp-content/uploads/news.xml', 'rss', ARRAY['land']::text[], 'bc', 'candidate', '0 9 * * *', 'BC Real Estate Board news and stats')
) AS v(name, url, type, categories, region, trust_level, scrape_frequency, notes)
WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.url = v.url);
