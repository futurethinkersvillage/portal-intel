export const CATEGORIES = [
  { slug: "land", label: "Rural Land & Property", description: "Homesteads, campsites, glamping retreats, tiny home villages, park model RV sites, recreational land, and rural real estate across BC and Alberta", icon: "🏔️", color: "emerald" },
  { slug: "grants", label: "Grants & Funding", description: "Rural land development, farming, land-based hospitality, glamping, off-grid energy grants and incentive programs", icon: "💰", color: "amber" },
  { slug: "community", label: "Community & Network", description: "People, profiles, services offered and needed, maker spaces, networking for builders and operators", icon: "🤝", color: "sky" },
  { slug: "jobs", label: "Jobs & Work", description: "Remote work, farmhand/work-stay, living-off-the-land employment opportunities", icon: "💼", color: "violet" },
  { slug: "events", label: "Events & Education", description: "Maker spaces, digital fabrication, alternative education, AI workshops, meetups, conferences", icon: "📅", color: "rose" },
  { slug: "buysell", label: "Buy & Sell", description: "Homesteading equipment, chicken coops, solar panels, RVs, building supplies, off-grid gear marketplace", icon: "🏪", color: "teal" },
  { slug: "risks", label: "Risks & Policy", description: "Government bills, carbon taxes, policy changes, financial system shifts, AI unemployment, threats to rural and resilient living", icon: "⚠️", color: "red" },
] as const;

export const REGIONS = [
  { slug: "bc", label: "British Columbia" },
  { slug: "ab", label: "Alberta" },
  { slug: "national", label: "National" },
] as const;

// Color mappings for category badges (Tailwind classes)
export const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  land:      { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  grants:    { bg: "bg-amber-500/10",   text: "text-amber-400" },
  community: { bg: "bg-sky-500/10",     text: "text-sky-400" },
  jobs:      { bg: "bg-violet-500/10",  text: "text-violet-400" },
  events:    { bg: "bg-rose-500/10",    text: "text-rose-400" },
  buysell:   { bg: "bg-teal-500/10",   text: "text-teal-400" },
  risks:     { bg: "bg-red-500/10",    text: "text-red-400" },
};

export const CATEGORY_ICONS: Record<string, string> = {
  land: "🏔️",
  grants: "💰",
  community: "🤝",
  jobs: "💼",
  events: "📅",
  buysell: "🏪",
  risks: "⚠️",
};

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export type RegionSlug = (typeof REGIONS)[number]["slug"];

// Bundled client-side data — pass to views via defaultContext to avoid hardcoding in EJS
export const CATEGORY_CLIENT_DATA: Record<string, { label: string; icon: string; color: string; badge: string; text: string }> = Object.fromEntries(
  CATEGORIES.map(c => [c.slug, {
    label: c.label,
    icon: c.icon,
    color: c.color,
    badge: `${CATEGORY_COLORS[c.slug].bg} ${CATEGORY_COLORS[c.slug].text}`,
    text: CATEGORY_COLORS[c.slug].text,
  }])
);

export const CATEGORY_ORDER = CATEGORIES.map(c => c.slug);
