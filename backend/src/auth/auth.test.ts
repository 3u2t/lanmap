import { describe, expect, it, vi } from "vitest";

vi.mock("../db/db.js", () => ({
  getDb: () => {
    throw new Error("no db in unit test");
  },
  initDb: () => null,
  getSetting: () => "",
  setSetting: () => {},
}));

import { hashPassword, loginAllowed, recordLoginAttempt, _resetLoginAttempts, verifyPassword } from "../auth/auth.js";

describe("password hashing", () => {
  it("roundtrips", async () => {
    const { hash, salt } = await hashPassword("correct-horse-9");
    expect(await verifyPassword("correct-horse-9", hash, salt)).toBe(true);
    expect(await verifyPassword("wrong", hash, salt)).toBe(false);
  });
});

describe("login rate limit", () => {
  it("blocks after 5 attempts", () => {
    _resetLoginAttempts();
    const ip = "10.0.0.99";
    for (let i = 0; i < 5; i++) recordLoginAttempt(ip);
    expect(loginAllowed(ip)).toBe(false);
    expect(loginAllowed("10.0.0.100")).toBe(true);
  });
});
