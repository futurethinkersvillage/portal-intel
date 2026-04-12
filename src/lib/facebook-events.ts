/**
 * Facebook event scraper using Firecrawl.
 *
 * Facebook heavily restricts scraping, but Firecrawl can often extract basic
 * event data from the public event pages. Returns structured data for the
 * admin to review + confirm before inserting into the meetups table.
 */

export interface ScrapedFacebookEvent {
  title: string;
  description?: string;
  event_date?: string; // ISO
  end_date?: string;
  location?: string;
  address?: string;
  image_url?: string;
  event_url: string;
  host?: string;
  attendees_count?: number;
}

const eventSchema = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const, description: "The event title" },
    description: { type: "string" as const, description: "Full event description" },
    event_date: { type: "string" as const, description: "Start date/time in ISO 8601 format" },
    end_date: { type: "string" as const, description: "End date/time in ISO 8601 format" },
    location: { type: "string" as const, description: "Venue or city name" },
    address: { type: "string" as const, description: "Full street address if available" },
    image_url: { type: "string" as const, description: "URL to the event cover image" },
    host: { type: "string" as const, description: "Host/organizer name" },
    attendees_count: { type: "number" as const, description: "Number of people going" },
  },
  required: ["title"],
};

export async function scrapeFacebookEvent(url: string): Promise<ScrapedFacebookEvent | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY not set");
  }

  // Normalize the URL — strip the tracking params
  let cleanUrl = url;
  try {
    const u = new URL(url);
    cleanUrl = `${u.origin}${u.pathname}`;
  } catch {
    // Use as-is
  }

  // Dynamically import Firecrawl
  let FirecrawlClient: any;
  try {
    const mod = await import("firecrawl" as any);
    FirecrawlClient = mod.FirecrawlClient || mod.default?.FirecrawlClient;
  } catch {
    throw new Error("Firecrawl package not available");
  }

  const client = new FirecrawlClient({ apiKey });

  const prompt = `Extract the Facebook event details from this page. Return the event title, full description, start and end date/time (ISO 8601 format), location (venue name or city), full address if shown, image URL for the cover photo, host/organizer name, and number of attendees going. If any field is not visible, omit it.`;

  try {
    const result = await client.scrape(cleanUrl, {
      formats: [{ type: "json", prompt, schema: eventSchema }],
      waitFor: 5000,
      onlyMainContent: true,
    });

    const data = (result as any)?.json as ScrapedFacebookEvent | undefined;
    if (!data || !data.title) return null;
    return { ...data, event_url: cleanUrl };
  } catch (err: any) {
    console.error(`[Facebook Scraper] ${cleanUrl}:`, err.message);
    throw err;
  }
}
