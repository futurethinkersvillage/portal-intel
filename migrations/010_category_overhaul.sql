-- Rename operators → community
UPDATE collected_items SET category = 'community' WHERE category = 'operators';
UPDATE submissions SET category = 'community' WHERE category = 'operators';
UPDATE profiles SET category = 'community' WHERE category = 'operators';
UPDATE sources SET categories = array_replace(categories, 'operators', 'community');

-- Remap infrastructure → land (enrichment will re-sort going forward)
UPDATE collected_items SET category = 'land' WHERE category = 'infrastructure';
UPDATE submissions SET category = 'land' WHERE category = 'infrastructure';
UPDATE sources SET categories = array_replace(categories, 'infrastructure', 'land');
