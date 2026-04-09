# Portal Intel Roadmap

Living planning document tracking all features, requests, and open questions for intel.portal.place. Updated as new requirements come in so nothing gets lost.

**Last updated:** 2026-04-08 (afternoon — deploy of headlines, Zoom, calls page, land detail, admin feed controls)

---

## Status Legend

- ✅ **Done** — live at intel.portal.place
- 🟡 **In progress** — partial implementation
- ⬜ **Planned** — committed but not started
- 💡 **Idea** — discussed but not committed

---

## 🎨 Design & Structure

### ✅ Completed
- ✅ Waitlist landing page with email form + Google OAuth sign-in
- ✅ Waitlist gate (`WAITLIST_MODE=true`) — non-admins redirect to thank-you page
- ✅ Real authentication via Better Auth + Google OAuth (fixed Fastify integration bug)
- ✅ Admin bootstrap via `ADMIN_EMAIL` env var
- ✅ Admin user management (`/admin/users`) — promote/demote
- ✅ Admin waitlist viewer (`/admin/waitlist`) with CSV export
- ✅ Logout dropdown in nav
- ✅ UI/UX overhaul round 1 (applied ui-ux-pro-max skill — SVG icons, focus rings, touch targets)
- ✅ UI polish round 2 (all admin + user pages with consistent tokens)

### 🟡 In progress
- 🟡 **Design parity with portal.place main site** (requested 2026-04-08)
  - ✅ Nav rebuilt to match: fixed header, `bg-warm-dark/70 backdrop-blur-md`, same spacing/typography/colors
  - ✅ Tailwind config updated with portal.place palette: `warm-dark` #1a1720, `indigo` #38387f, `terracotta` #af695e, `mauve` #73516f, `amber` #ea824e, `cream` #faf8f4, `off-white` #f2ede8
  - ⬜ Update all page backgrounds from `bg-stone-950/900` → `bg-warm-dark`
  - ⬜ Update all cards from `bg-stone-900/60 border-stone-800/60` → match portal.place section styling
  - ⬜ Verify typography matches main site

---

## 📰 Feed & Content Quality

### ✅ Completed
- ✅ 7-category system: land, grants, community, jobs, events, buysell, risks
- ✅ Centralized category color/icon system (single source in categories.ts)
- ✅ Content filtering in enrichment prompts (exclude ESG/DEI, nursing, aspirational)
- ✅ Admin feedback loop: downvote comments feed back into enrichment prompts (feedback-context.ts)
- ✅ Admin upvote/downvote on feed items (with required comment)
- ✅ Admin rating on sources (like/dislike)
- ✅ Pinned items (float to top of feed)
- ✅ Downvoted items admin view with restore
- ✅ Manual scraping only — "Scrape All Sources" button on admin dashboard

### ⬜ Open gaps (from recent feedback 2026-04-08)
### ✅ Just shipped (2026-04-08 afternoon)
- ✅ **AI-written headlines** — enrichment prompt rewritten to force action-oriented, fact-leading titles (max 80 chars, lead with verb/noun, surface price/deadline/location). New `ai_headline` column in DB. Feed query uses it as displayed title.
- ✅ **Re-enrich button** in admin dashboard — queues all unvoted items for re-processing with the new prompt
- ✅ **Admin vote/comment/pin controls inline on every feed card** — required-comment vote buttons + pin toggle directly on cards. Optimistic UI updates via fetch().
- ✅ **"View" button removed from feed cards** — title links only to detail page; external source link only on detail page
- ✅ **Decision: NO public upvote/downvote** — only admin voting. Members signal value via comments + saves.

### ⬜ Open gaps
- ⬜ **Fix Firecrawl credits** — all 4 keys (Portal Intel, Mission Control, Client Research, Default) currently show 0 remaining credits. Blocks Facebook event scraping AND HTML source scraping. **Mike action needed.**
- ⬜ **Jobs category has 0 items** — no working RSS feeds found. Need to discover jobs sources

---

## 📅 Events & Calls

### ✅ Completed
- ✅ Events page with meetup RSVPs
- ✅ Calls placeholder page
- ✅ Admin events management (create, RSVPs, CSV export)

### ✅ Just shipped (2026-04-08 afternoon)
- ✅ **Zoom S2S OAuth client** (`src/lib/zoom.ts`) with topic keyword filter for land/portal/resilience/AI
- ✅ **Zoom sync worker** (`src/workers/zoom-sync.ts`) — pulls upcoming meetings + past recordings, upserts to `calls` table
- ✅ **`calls` table** (migration 013) — separate from meetups, with `is_past`, `recording_url`, `categories`, `zoom_meeting_id`
- ✅ **`/calls` page rebuilt** — upcoming + past sections with join URLs, recording links, category badges
- ✅ **`/events` page** — past events section at the bottom
- ✅ **Facebook event import** — admin form at `/admin/events` tries Firecrawl scrape, falls back to manual entry form (because Firecrawl is currently 0 credits)
- ✅ **Manual call creation** — admin can add past Zoom calls directly via `/admin/events`
- ✅ **"Sync Zoom" button** in admin dashboard
- ✅ **Zoom env vars** (`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`) added to Coolify

### ⬜ Still pending
- ⬜ **Initial seed data** — Mike to manually add via admin UI (or click "Sync Zoom" once and the past Zoom call from yesterday should appear if it has a recording)
- ⬜ **Recurring meetup scraper for Interior BC** — needs Firecrawl credits to work; deferred to next session
- ⬜ **Zoom recording transcripts** — Whisper transcription pipeline (deferred)
- ⬜ **Call summaries from transcripts** — Claude-generated post-call notes (deferred)

---

## 🏞️ Rural Land & Property

### ✅ Just shipped (2026-04-08 afternoon)
- ✅ **Custom land listing detail page** — `src/views/item-detail-land.ejs`. Shows key stats grid (price, acreage, zoning, water, access, power, closest town), expanded summary, View Listing CTA, and the investment pooling widget below
- ✅ **Investment pooling widget** with soft-interest pledging:
  - Tally bar showing "$X pooled · N members interested" with progress vs. asking price
  - Pledge form: amount, timeline (now / 3m / 6m / 12m), contact consent, optional note
  - **Clearly labeled disclaimer**: "This is soft interest only. No money moves, no commitment, no obligation."
  - Withdraw button if you've already pledged
- ✅ **`item_interest` table** — stores pledges with `pledge_amount`, `timeline`, `contact_consent`, `note`. Unique per (item, user).
- ✅ **`details` JSONB column on collected_items** — enrichment populates this with structured land data (price, acreage, zoning, etc.)
- ✅ **Enrichment prompt extended** to extract land details for `category='land'` items
- ✅ **Item detail dispatcher** — `/feed/:itemId` picks `item-detail-land.ejs` for land items, `item-detail-generic.ejs` for everything else

### ⬜ Still planned
- ⬜ **Map view for all land listings** — mapbox or leaflet showing pins, filterable
- ⬜ **International land watching** — add Colombia, Argentina, Mexico, Portugal, Thailand as scrape targets. Spanish→English translation in enrichment.
- ⬜ **Land-type sub-scrapers** — discover sources for: resorts for sale, retreat centers, eco-villages, off-grid homesteads, tiny home communities
- ⬜ **Admin "Add Land Region" tool** — enter country/keywords, system discovers sources
- ⬜ **Land detail page enhancements** — once Mike has real land items in the feed: photo gallery, similar listings, "people who pooled here also looked at..."

---

## 💬 Community Forum

### ✅ Completed
- ✅ Threaded comments on feed items (`/feed/:itemId`)
- ✅ Standalone discussion threads (`/discussions`)
- ✅ Admin comment moderation (`/admin/comments`) — flag, hide, restore, delete
- ✅ Community profiles (`/community`, formerly `/operators`)

### 💡 Ideas
- 💡 Email notifications when someone replies to your comment
- 💡 "Watch this discussion" to get updates on new replies
- 💡 Reputation/karma for quality contributors (admin-curated, not upvote-based)

---

## 🔧 Custom Page Designs Per Feed Type (New ideas 2026-04-08)

Rather than one generic `item-detail.ejs`, build category-specific layouts:

- ⬜ **Land listing page** (see Rural Land section above) — key stats, map, investment interest pooling
- ⬜ **Grant detail page** — deadline countdown, eligibility checklist, "Who's applying?" visibility, AI-generated application tips, previous recipient data, required documents list
- ⬜ **Event/Meetup detail page** — already exists, but could add: attendee list (opt-in), related events, post-event notes/recordings link
- ⬜ **Job detail page** — application deadline, salary range (if mentioned), remote/in-person, company background, "similar roles" section
- ⬜ **Buy/Sell listing page** — photo gallery (if scraped), contact method, similar items nearby, price history, "I'm interested" button
- ⬜ **Risk/Policy detail page** — plain-language summary of the bill/policy, who it affects, timeline of when it takes effect, "What you can do" (petition, consultation, MLA contact), related items

**Pattern**: Each detail page uses the same `/feed/:itemId` route but the controller picks the template based on `item.category`.

---

## 📞 Calls Page Functionality (Requested 2026-04-08)

- 🟡 Automatic sync from Zoom (public calls on topics: land, portal, resilience, AI)
- 🟡 Past calls archive
- ⬜ Zoom recording links (when available via API)
- ⬜ Call transcripts (auto-generated via Whisper from Zoom recordings)
- ⬜ Call summaries (auto-generated via Claude from transcripts)
- ⬜ "RSVP to upcoming call" — adds to user's Google Calendar, sends reminder
- ⬜ Recurring call schedule display (e.g. "Every Tuesday 7pm PT")

---

## 🛠️ Admin Dashboard

### ✅ Completed
- ✅ Sources, Items, Submissions, Newsletter, Events, AI Search, Downvoted, Comments, Users, Waitlist tiles
- ✅ "Scrape All Sources" button
- ✅ API cost calculator with period toggles
- ✅ Admin feedback UI (vote + required comment + pin)

### ⬜ Planned
- ⬜ **"Sync Zoom Calls" button** — triggers Zoom API fetch
- ⬜ **"Scrape Meetups (Interior BC)" button** — triggers Facebook + web meetup scrape
- ⬜ **Source discovery tool for new regions** — enter "Colombia eco-villages" and get a ranked list of potential sources to add
- ⬜ **Bulk re-enrich button** — force re-run enrichment on all items (for when prompts change)
- ⬜ **Dashboard stats** — waitlist signups graph, items collected this week, admin vote activity, flagged comments count

---

## 📊 Intel Quality & Training

### Admin feedback loop
- ✅ Admin votes on items feed downvote comments into enrichment prompts
- ✅ Admin rates sources; rating propagates to `yield_score`
- ⬜ **Weekly digest to Mike**: "Here are 10 items — rate them to train the system"
- ⬜ **A/B testing**: run two enrichment prompt variants, see which produces more upvotes

---

## ✅ Quick wins (next session)

Priority order for the next work session:

1. **Design parity** — finish updating all view backgrounds/cards to match portal.place palette
2. **Better headline prompts** — rewrite `enrichment.ts` prompt to force compelling, action-oriented headlines
3. **Zoom + Facebook events** — get the seed data in (tonight's FB event, past events, yesterday's Zoom call)
4. **Manual FB event scraper** — Firecrawl-based, pasted URL → parsed event → added to DB
5. **Custom land listing page** — first category-specific detail template

---

## 🚫 Deferred / Parked

- Newsletter automation (send scheduled weekly digests) — exists in code, not scheduled yet
- Public item voting (needs UX design — who sees counts, how to prevent brigading)
- International land sources — waiting for BC/AB to be solid first

---

## 🔑 Key Credentials Reference

*Stored in `c:/Users/miken/Projects/Access/system_context.md`*

- **Zoom S2S OAuth**: Account ID `fXZUhvN9Rw67GnUOpfBkgA`, Client ID `PZQBNRWWSi2A7VW8FfWrgw`, Client Secret `Ab6F6LdX1eV3QGlfj1yiFoZnLadmpgbc`
- **Firecrawl (Portal Intel)**: `fc-e295636c59944320a5fdccf1102706b6` *(may need recharge verification)*
- **Google OAuth (Intel)**: Client ID `32436512516-a89sis4kc5pqj4jbovjgp4nj0ujo5n7v...`, already deployed
- **Coolify**: App UUID `w2moyf147ag5k1xk3srj2y8m`, API token in system_context.md
- **Anthropic (enrichment)**: key stored in Coolify env as `ANTHROPIC_API_KEY`

---

## Answered decisions

*Resolved questions from 2026-04-08:*

1. **Public item voting**: ❌ **NO**. Only admin voting/commenting. Admin controls need to be surfaced directly on feed item cards (not just the detail page) so Mike can vote while scrolling.
2. **"View" button on feed cards**: ❌ **Remove it**. Item title click goes to detail page. External source link only on the detail page.
3. **Investment pledging**: ✅ **Soft interest only** — no money moves, no Stripe. Must be clearly labeled as "expression of interest, not a commitment" so users understand they aren't beholden to anything.
4. **Priority order**: No preference — work through all items in the roadmap, tracking everything so nothing gets lost.

## Still-open questions for Mike

1. **Jobs sources**: any preferred sources? Currently 0 items in jobs category
2. **Firecrawl credits**: should I use the old key `fc-e295636c59944320a5fdccf1102706b6` or generate a new one? Was failing with "insufficient credits" in last session
3. **Zoom meeting visibility**: should ALL public meetings in your account sync, or only meetings with specific keywords in the title (land/portal/resilience/AI)? *Default plan: keyword-filter*
4. **International land priority order**: which country/region first — Colombia, Argentina, Mexico, Portugal, Thailand?
