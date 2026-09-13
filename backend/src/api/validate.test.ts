import { describe, expect, it } from "vitest";
import { isPrivateCidr } from "@lanmap/shared";

const PATCH_FIELDS = new Set(["customName", "category", "monitored", "ignored"]);

describe("api validation", () => {
  it("rejects public scan targets", () => {
    expect(isPrivateCidr("8.8.8.8/32")).toBe(false);
    expect(isPrivateCidr("192.168.1.0/24")).toBe(true);
  });
  it("rejects unknown patch fields", () => {
    expect(PATCH_FIELDS.has("pingArgs")).toBe(false);
    expect(PATCH_FIELDS.has("customName")).toBe(true);
  });
  it("rejects bad hostname for dns test", () => {
    expect(/^[a-zA-Z0-9.-]{1,253}$/.test("evil; rm -rf")).toBe(false);
    expect(/^[a-zA-Z0-9.-]{1,253}$/.test("example.com")).toBe(true);
  });
});
