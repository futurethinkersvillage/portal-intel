export const CATEGORIES = [
  { slug: "land", label: "Land & Property", description: "Listings, auctions, agricultural land, rural property" },
  { slug: "grants", label: "Grants & Funding", description: "Government grants, incentive programs, funding rounds" },
  { slug: "operators", label: "Operators & Trades", description: "Contractors, services, trades, maker spaces" },
  { slug: "jobs", label: "Jobs & Work Opportunities", description: "Work-stay, project gigs, seasonal work, remote roles" },
  { slug: "events", label: "Events & Education", description: "Workshops, meetups, immersions, conferences, courses" },
  { slug: "infrastructure", label: "Infrastructure & Building", description: "Prefab, energy, water, off-grid systems, installations" },
] as const;

export const REGIONS = [
  { slug: "bc", label: "British Columbia" },
  { slug: "ab", label: "Alberta" },
  { slug: "national", label: "National" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export type RegionSlug = (typeof REGIONS)[number]["slug"];
