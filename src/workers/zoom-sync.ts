import pool from "../lib/db.js";
import { listUpcomingMeetings, listPastRecordings, matchTopicKeywords } from "../lib/zoom.js";

export interface ZoomSyncResult {
  upcomingFetched: number;
  upcomingAdded: number;
  upcomingUpdated: number;
  pastFetched: number;
  pastAdded: number;
  pastUpdated: number;
  skipped: number;
  errors: string[];
}

/**
 * Pull upcoming + past meetings from Zoom and upsert them into the `calls` table.
 * Only meetings matching the topic keyword filter are stored. Public-only.
 */
export async function syncZoomCalls(): Promise<ZoomSyncResult> {
  const result: ZoomSyncResult = {
    upcomingFetched: 0,
    upcomingAdded: 0,
    upcomingUpdated: 0,
    pastFetched: 0,
    pastAdded: 0,
    pastUpdated: 0,
    skipped: 0,
    errors: [],
  };

  // Upcoming meetings
  try {
    const upcoming = await listUpcomingMeetings();
    result.upcomingFetched = upcoming.length;

    for (const m of upcoming) {
      const categories = matchTopicKeywords(m.topic, m.agenda);
      if (categories.length === 0) {
        result.skipped++;
        continue;
      }

      const meetingId = String(m.id);
      const { rows: existing } = await pool.query(
        `SELECT id FROM calls WHERE zoom_meeting_id = $1`,
        [meetingId]
      );

      if (existing.length > 0) {
        await pool.query(
          `UPDATE calls SET
             title = $1,
             description = $2,
             scheduled_at = $3,
             duration_minutes = $4,
             join_url = $5,
             registration_url = $6,
             categories = $7,
             is_past = false,
             updated_at = now()
           WHERE zoom_meeting_id = $8`,
          [
            m.topic,
            m.agenda || null,
            m.start_time,
            m.duration,
            m.join_url,
            m.registration_url || null,
            categories,
            meetingId,
          ]
        );
        result.upcomingUpdated++;
      } else {
        await pool.query(
          `INSERT INTO calls (zoom_meeting_id, title, description, host_name, scheduled_at, duration_minutes, join_url, registration_url, categories, is_past, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, 'zoom')`,
          [
            meetingId,
            m.topic,
            m.agenda || null,
            m.host_email || null,
            m.start_time,
            m.duration,
            m.join_url,
            m.registration_url || null,
            categories,
          ]
        );
        result.upcomingAdded++;
      }
    }
  } catch (err: any) {
    console.error("[Zoom Sync] Upcoming fetch failed:", err.message);
    result.errors.push(`upcoming: ${err.message}`);
  }

  // Past recordings
  try {
    const past = await listPastRecordings();
    result.pastFetched = past.length;

    for (const rec of past) {
      const categories = matchTopicKeywords(rec.topic);
      if (categories.length === 0) {
        result.skipped++;
        continue;
      }

      const meetingId = String(rec.id);
      // Find the first playable recording file (video)
      const videoFile = rec.recording_files?.find(
        (f) => f.file_type === "MP4" || f.file_type === "SHARED_SCREEN_WITH_SPEAKER_VIEW"
      );
      const recordingUrl = rec.share_url || videoFile?.play_url || null;

      const { rows: existing } = await pool.query(
        `SELECT id FROM calls WHERE zoom_meeting_id = $1`,
        [meetingId]
      );

      if (existing.length > 0) {
        await pool.query(
          `UPDATE calls SET
             title = $1,
             scheduled_at = $2,
             duration_minutes = $3,
             recording_url = COALESCE($4, recording_url),
             recording_password = COALESCE($5, recording_password),
             categories = $6,
             is_past = true,
             updated_at = now()
           WHERE zoom_meeting_id = $7`,
          [
            rec.topic,
            rec.start_time,
            rec.duration,
            recordingUrl,
            rec.password || null,
            categories,
            meetingId,
          ]
        );
        result.pastUpdated++;
      } else {
        await pool.query(
          `INSERT INTO calls (zoom_meeting_id, title, scheduled_at, duration_minutes, recording_url, recording_password, categories, is_past, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'zoom')`,
          [
            meetingId,
            rec.topic,
            rec.start_time,
            rec.duration,
            recordingUrl,
            rec.password || null,
            categories,
          ]
        );
        result.pastAdded++;
      }
    }
  } catch (err: any) {
    console.error("[Zoom Sync] Past recordings fetch failed:", err.message);
    result.errors.push(`past: ${err.message}`);
  }

  // Sweep: mark any previously-upcoming calls whose scheduled_at is now in the past
  await pool.query(
    `UPDATE calls SET is_past = true WHERE scheduled_at < now() AND is_past = false`
  );

  console.log(
    `[Zoom Sync] upcoming: ${result.upcomingFetched} fetched, ${result.upcomingAdded} added, ${result.upcomingUpdated} updated | ` +
    `past: ${result.pastFetched} fetched, ${result.pastAdded} added, ${result.pastUpdated} updated | ` +
    `skipped (no keyword match): ${result.skipped}`
  );

  return result;
}
