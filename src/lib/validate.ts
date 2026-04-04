export class ValidationError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function requireString(value: unknown, field: string, maxLength = 500): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(field, `${field} is required`);
  }
  return value.trim().substring(0, maxLength);
}

export function optionalString(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return value.trim().substring(0, maxLength);
}

export function requireUrl(value: unknown, field: string): string {
  const str = requireString(value, field, 2000);
  try {
    const u = new URL(str);
    if (!["http:", "https:"].includes(u.protocol)) throw new Error();
    return str;
  } catch {
    throw new ValidationError(field, `${field} must be a valid URL`);
  }
}

export function requireEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(field, `${field} must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

export function optionalDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}
