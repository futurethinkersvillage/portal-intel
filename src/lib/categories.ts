export const CATEGORIES = [
  { slug: "land", label: "Land & Property", description: "Listings, auctions, agricultural land, rural property", icon: "🏔️", color: "emerald" },
  { slug: "grants", label: "Grants & Funding", description: "Government grants, incentive programs, funding rounds", icon: "💰", color: "amber" },
  { slug: "operators", label: "Operators & Trades", description: "Contractors, services, trades, maker spaces", icon: "🔧", color: "sky" },
  { slug: "jobs", label: "Jobs & Work Opportunities", description: "Work-stay, project gigs, seasonal work, remote roles", icon: "💼", color: "violet" },
  { slug: "events", label: "Events & Education", description: "Workshops, meetups, immersions, conferences, courses", icon: "📅", color: "rose" },
  { slug: "infrastructure", label: "Infrastructure & Building", description: "Prefab, energy, water, off-grid systems, installations", icon: "🏗️", color: "orange" },
] as const;

export const REGIONS = [
  { slug: "bc", label: "British Columbia" },
  { slug: "ab", label: "Alberta" },
  { slug: "national", label: "National" },
] as const;

// Color mappings for category badges (Tailwind classes)
export const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  land:           { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  grants:         { bg: "bg-amber-500/10",   text: "text-amber-400" },
  operators:      { bg: "bg-sky-500/10",     text: "text-sky-400" },
  jobs:           { bg: "bg-violet-500/10",  text: "text-violet-400" },
  events:         { bg: "bg-rose-500/10",    text: "text-rose-400" },
  infrastructure: { bg: "bg-orange-500/10",  text: "text-orange-400" },
};

export const CATEGORY_ICONS: Record<string, string> = {
  land: "🏔️",
  grants: "💰",
  operators: "🔧",
  jobs: "💼",
  events: "📅",
  infrastructure: "🏗️",
};

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export type RegionSlug = (typeof REGIONS)[number]["slug"];
