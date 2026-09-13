import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { getDb } from "../db/db.js";

const scrypt = promisify(_scrypt);

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  return { hash: buf.toString("hex"), salt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const buf = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (buf.length !== expected.length) return false;
  return timingSafeEqual(buf, expected);
}

export function setupNeeded(): boolean {
  const r = getDb().prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  return r.n === 0;
}

export async function createUser(username: string, password: string): Promise<number> {
  const { hash, salt } = await hashPassword(password);
  const r = getDb()
    .prepare("INSERT INTO users (username, pass_hash, salt, created_at) VALUES (?, ?, ?, ?)")
    .run(username.trim(), hash, salt, Date.now());
  return Number(r.lastInsertRowid);
}

export async function verifyUser(username: string, password: string): Promise<number | null> {
  const row = getDb().prepare("SELECT id, pass_hash, salt FROM users WHERE username = ?").get(username.trim()) as
    | { id: number; pass_hash: string; salt: string }
    | undefined;
  if (!row) return null;
  if (!(await verifyPassword(password, row.pass_hash, row.salt))) return null;
  return row.id;
}

export function createSession(userId: number, ttlHours = 24): { token: string; expiresAt: number } {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + ttlHours * 3600000;
  getDb()
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(token, userId, expiresAt, Date.now());
  return { token, expiresAt };
}

export function getSessionUser(token: string | undefined): number | null {
  if (!token) return null;
  const row = getDb().prepare("SELECT user_id, expires_at FROM sessions WHERE id = ?").get(token) as
    | { user_id: number; expires_at: number }
    | undefined;
  if (!row || row.expires_at < Date.now()) return null;
  return row.user_id;
}

export function destroySession(token: string | undefined): void {
  if (!token) return;
  getDb().prepare("DELETE FROM sessions WHERE id = ?").run(token);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (process.env.DEMO_MODE === "true") {
    next();
    return;
  }
  const userId = getSessionUser(req.cookies?.lanmap_session);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  (req as Request & { userId: number }).userId = userId;
  next();
}

const attempts = new Map<string, number[]>();

export function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const arr = (attempts.get(ip) ?? []).filter((t) => now - t < 60_000);
  attempts.set(ip, arr);
  return arr.length < 5;
}

export function recordLoginAttempt(ip: string): void {
  const arr = attempts.get(ip) ?? [];
  arr.push(Date.now());
  attempts.set(ip, arr);
}

export function _resetLoginAttempts(): void {
  attempts.clear();
}
