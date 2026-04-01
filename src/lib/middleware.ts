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

    // Get or create user_profiles row
    const { rows } = await pool.query(
      `INSERT INTO user_profiles (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING role, onboarded`,
      [session.user.id]
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

// Require authentication
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = await getUser(request);
  if (!user) {
    reply.redirect("/");
    return;
  }
  (request as any).user = user;
}

// Require admin role
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const user = await getUser(request);
  if (!user || user.role !== "admin") {
    reply.status(403).send({ error: "Forbidden" });
    return;
  }
  (request as any).user = user;
}
