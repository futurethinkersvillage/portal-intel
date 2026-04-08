# Portal Intel Roadmap

Living planning document tracking all features, requests, and open questions for intel.portal.place. Updated as new requirements come in so nothing gets lost.

**Last updated:** 2026-04-08

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
- ⬜ **Better AI-written headlines**: current feed titles are "un-actionable and hard to understand at a glance". Rewrite enrichment prompt to force compelling, specific, action-oriented headlines with key facts (price, location, deadline) in the first line
- ⬜ **Public upvote/downvote on feed items** — currently only admins vote. Signed-in members need a way to signal value without writing a comment. Separate from admin votes (admin = "on-strategy?", users = "does this resonate?")
- ⬜ **Fix Firecrawl credits on production** — was failing with "insufficient credits", user said they recharged, need to verify old key still works or get new one
- ⬜ **Re-enrich existing items** — items already in feed were collected before the content filtering + better prompts were deployed. Need a one-time re-enrichment pass
- ⬜ **Jobs category has 0 items** — no working RSS feeds found. Need to discover jobs sources (WorkBC, Job Bank RSS, remote work boards filtered for BC/AB)

---

## 📅 Events & Calls

### ✅ Completed
- ✅ Events page with meetup RSVPs
- ✅ Calls placeholder page
- ✅ Admin events management (create, RSVPs, CSV export)

### 🟡 In progress (requested 2026-04-08)
- 🟡 **Zoom call sync**: automatic ingestion of public calls from Mike's Zoom account via Server-to-Server OAuth API. Filter by topic keywords: land, portal, resilience, AI. Add to Calls page. *Credentials available in system_context.md*
- 🟡 **Facebook events scraping via Firecrawl**: Mike uses Facebook for events. Need to scrape + add to Events page
- 🟡 **Past events section** at bottom of both Events and Calls pages
- 🟡 **Initial seed data requested**:
  - Tonight's FB event: https://www.facebook.com/events/1939875699956068/
  - Last in-person event (past): https://www.facebook.com/events/2385177575332592/
  - Yesterday's Zoom call (past): fetch from Mike's Zoom account
- 🟡 **Recurring meetup scraper for Interior BC**: scrape Facebook + web search for cultural/business meetups in Interior BC region. Location filtering required. Needs admin dashboard sync button. May need additional tooling (FB events are hard to scrape).

---

## 🏞️ Rural Land & Property (New ideas 2026-04-08)

### ⬜ Planned
- ⬜ **Custom land listing detail pages** — dedicated layout per land project with key info: acreage, price, zoning, water rights, access, deadline. Replaces the generic item-detail for `category === 'land'`
- ⬜ **"Interested in investing" button** — users signal interest in pooling funds
- ⬜ **Fund pooling widget** — tallies amount needed vs. total pledged interest. Shows momentum (e.g. "$250K pledged of $1.2M needed")
- ⬜ **Map view for all land listings** — mapbox or google maps showing BC + AB land pins, filterable by category/region/price
- ⬜ **International land watching** — add Colombia, Argentina, Mexico, Portugal, Thailand as scrape targets. Need language translation (Spanish → English)
- ⬜ **Land-type sub-scrapers**: discover sources for specific types — resorts for sale, retreat centers, eco-villages, off-grid homesteads, tiny home communities
- ⬜ **Admin "Add Land Region" tool** — specify new country/province + keywords, system discovers sources and starts scraping

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

## Open questions for Mike

1. **Public item voting**: add or not? If yes, what does the community see — just counts, or ranked?
2. **Jobs sources**: any preferred sources? Currently 0 items in jobs category
3. **Firecrawl credits**: should I use the old key or generate a new one?
4. **Zoom meeting visibility**: should ALL public meetings in your account sync, or only meetings with specific keywords in the title?
5. **International land priority order**: which country/region first — Colombia, Argentina, Mexico, Portugal, Thailand?
6. **Investment pledging**: is this real pledging (with Stripe pre-auth) or soft interest only (no money moves)?
