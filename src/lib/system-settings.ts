import pool from "./db.js";

/**
 * Read a system setting from the DB.
 * Returns the value as a string, or the defaultValue if the key doesn't exist.
 */
export async function getSetting(key: string, defaultValue = "false"): Promise<string> {
  try {
    const { rows } = await pool.query(
      `SELECT value FROM system_settings WHERE key = $1`,
      [key]
    );
    return rows[0]?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function isEnabled(key: string): Promise<boolean> {
  const val = await getSetting(key, "false");
  return val === "true";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `UPDATE system_settings SET value = $1, updated_at = now() WHERE key = $2`,
    [value, key]
  );
}

export async function getAllSettings(): Promise<Array<{ key: string; value: string; label: string; description: string; updated_at: string }>> {
  const { rows } = await pool.query(
    `SELECT key, value, label, description, updated_at FROM system_settings ORDER BY key`
  );
  return rows;
}
