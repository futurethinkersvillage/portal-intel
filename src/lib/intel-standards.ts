/**
 * Loads the Intel Standards document and exports it as a string for injection
 * into AI enrichment and extraction prompts.
 *
 * Edit docs/intel-standards.md to tune content filtering — no code changes needed.
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STANDARDS_PATH = join(__dirname, "../../docs/intel-standards.md");

let _cached: string | null = null;

export function getIntelStandards(): string {
  if (_cached) return _cached;
  try {
    _cached = readFileSync(STANDARDS_PATH, "utf-8");
    return _cached;
  } catch {
    console.warn("[Intel Standards] Could not load docs/intel-standards.md — using fallback");
    return FALLBACK_STANDARDS;
  }
}

// Minimal fallback if the file isn't found (e.g. in test environments)
const FALLBACK_STANDARDS = `
CONTENT STANDARDS (fallback — load docs/intel-standards.md for full version):
- INCLUDE: Rural BC/AB land listings with price + acreage, specific grants with dollar amounts and deadlines, active wildfires and policy changes with timelines, trades jobs in BC/AB with wages, rural skills workshops with future dates, rural operations equipment with prices
- EXCLUDE: Bike parts, tourism marketing, obituaries, sports scores, local crime, urban entertainment, jobs outside BC/AB, nursing/clinical/childcare/food service jobs, generic government portal pages, past events, ESG programs, anything with no price/deadline/location/contact
- Score 0.0 and archive immediately if it fails these tests
`;
