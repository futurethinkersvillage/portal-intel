/**
 * Zoom Server-to-Server OAuth client.
 *
 * Environment variables required:
 *   ZOOM_ACCOUNT_ID
 *   ZOOM_CLIENT_ID
 *   ZOOM_CLIENT_SECRET
 */

interface ZoomTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface ZoomMeeting {
  uuid: string;
  id: number;
  host_id?: string;
  host_email?: string;
  topic: string;
  type: number; // 1=instant, 2=scheduled, 3=recurring no-fixed, 8=recurring fixed
  start_time: string;
  duration: number;
  timezone?: string;
  created_at: string;
  join_url: string;
  registration_url?: string;
  agenda?: string;
}

export interface ZoomRecording {
  uuid: string;
  id: number;
  topic: string;
  start_time: string;
  duration: number;
  share_url?: string;
  password?: string;
  recording_files?: Array<{
    id: string;
    recording_start: string;
    recording_end: string;
    file_type: string;
    file_extension: string;
    play_url?: string;
    download_url?: string;
  }>;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Reuse cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const accountId = process.env.ZOOM_ACCOUNT_ID;
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom credentials not set (ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET)");
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom OAuth failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as ZoomTokenResponse;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function zoomRequest<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = await getAccessToken();
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.zoom.us/v2${path}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom API ${path} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

/** List upcoming scheduled meetings for the authenticated user */
export async function listUpcomingMeetings(): Promise<ZoomMeeting[]> {
  const data = await zoomRequest<{ meetings: ZoomMeeting[] }>(
    "/users/me/meetings",
    { type: "upcoming", page_size: "100" }
  );
  return data.meetings || [];
}

/** List past recorded meetings (with recordings) */
export async function listPastRecordings(fromDate?: string): Promise<ZoomRecording[]> {
  // Default: last 90 days
  const from = fromDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const to = new Date().toISOString().split("T")[0];
  const data = await zoomRequest<{ meetings: ZoomRecording[] }>(
    "/users/me/recordings",
    { from, to, page_size: "100" }
  );
  return data.meetings || [];
}

/** Fetch the full details of a single meeting by ID */
export async function getMeeting(meetingId: number | string): Promise<ZoomMeeting> {
  return zoomRequest<ZoomMeeting>(`/meetings/${meetingId}`);
}

/**
 * Check if a meeting topic matches the Portal Intel keyword filter.
 * Returns category tags derived from the topic, or a generic ["general"] tag if no
 * specific category matches — so all meetings from the account are synced.
 * The admin controls visibility via the is_public flag per call.
 */
export function matchTopicKeywords(topic: string, agenda?: string): string[] {
  const text = `${topic || ""} ${agenda || ""}`.toLowerCase();
  const matches: string[] = [];

  // Land-related keywords
  if (/\b(land|property|homestead|farm|acreage|ranch|rural|village|off[- ]grid|off grid)\b/.test(text)) {
    matches.push("land");
  }
  // Portal.Place / FutureThinkers specific
  if (/\b(portal\.?place|portal place|smart village|wells gray|futurethinkers?)\b/.test(text)) {
    matches.push("portal");
  }
  // Resilience / community building
  if (/\b(resilience|resilient|community build|regenerative|permaculture|food security|sovereign|preparedness)\b/.test(text)) {
    matches.push("resilience");
  }
  // AI / tech
  if (/\b(ai|artificial intelligence|agent|llm|machine learning|claude|gpt|automation)\b/.test(text)) {
    matches.push("ai");
  }
  // Network / community calls
  if (/\b(network|western canada|global network|community call|office hours|mastermind)\b/.test(text)) {
    matches.push("community");
  }

  // Default: tag as "general" so all meetings from this account are synced.
  // Admin can toggle is_public to hide/show individual calls.
  if (matches.length === 0) {
    matches.push("general");
  }

  return matches;
}
