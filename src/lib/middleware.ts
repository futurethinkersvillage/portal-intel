import { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "./auth.js";
import { fromNodeHeaders } from "better-auth/node";
import pool from "./db.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role: string;
  onboarded: boolean;
}

// Get current user from session (returns null if not authenticated)
export async function getUser(request: FastifyRequest): Promise<AuthUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session?.user) return null;

    // Bootstrap admin: if this user's email matches ADMIN_EMAIL, ensure they're admin.
    // ADMIN_EMAIL can be a comma-separated list of emails for multiple admins.
    const adminEmails = (process.env.ADMIN_EMAIL || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isBootstrapAdmin = adminEmails.includes((session.user.email || "").toLowerCase());

    // Get or create user_profiles row, optionally promoting to admin
    const { rows } = await pool.query(
      `INSERT INTO user_profiles (user_id, role) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET
         role = CASE WHEN $2 = 'admin' THEN 'admin' ELSE user_profiles.role END,
         updated_at = now()
       RETURNING role, onboarded`,
      [session.user.id, isBootstrapAdmin ? "admin" : "subscriber"]
    );

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
      role: rows[0]?.role || "subscriber",
      onboarded: rows[0]?.onboarded || false,
    };
  } catch {
    return null;
  }
}

const DEV_USER: AuthUser = {
  id: "dev",
  email: "dev@portal.place",
  name: "Dev Mode",
  image: null,
  role: "admin",
  onboarded: true,
};

// Require authentication
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (process.env.DEV_MODE === "true") {
    (request as any).user = DEV_USER;
    return;
  }
  const user = await getUser(request);
  if (!user) {
    reply.redirect("/");
    return;
  }
  // Waitlist mode: only admins can access authenticated routes
  if (process.env.WAITLIST_MODE === "true" && user.role !== "admin") {
    reply.redirect("/waitlist/thanks");
    return;
  }
  (request as any).user = user;
}

// Require admin role
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (process.env.DEV_MODE === "true") {
    (request as any).user = DEV_USER;
    return;
  }
  const user = await getUser(request);
  if (!user || user.role !== "admin") {
    reply.status(403).send({ error: "Forbidden" });
    return;
  }
  (request as any).user = user;
}
