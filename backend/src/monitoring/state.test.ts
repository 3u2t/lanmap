import { describe, expect, it } from "vitest";
import { isPrivateCidr, listHosts, nextPresenceState, packetLossPct } from "@lanmap/shared";

describe("scan validation", () => {
  it("rejects public ranges", () => {
    expect(isPrivateCidr("8.8.8.0/24")).toBe(false);
    expect(isPrivateCidr("0.0.0.0/0")).toBe(false);
  });
  it("caps large ranges", () => {
    expect(listHosts("10.0.0.0/8", 1024)).toBeNull();
    expect(listHosts("192.168.1.0/24", 1024)).toHaveLength(254);
  });
});

describe("presence state", () => {
  it("single failure keeps unknown, third marks offline", () => {
    expect(nextPresenceState({ probeOk: false, consecutiveFailures: 0, offlineAfterFailures: 3 }).status).toBe("unknown");
    expect(nextPresenceState({ probeOk: false, consecutiveFailures: 2, offlineAfterFailures: 3 }).status).toBe("offline");
  });
  it("recovery marks online", () => {
    expect(nextPresenceState({ probeOk: true, consecutiveFailures: 5, offlineAfterFailures: 3 }).status).toBe("online");
  });
});

describe("packet loss", () => {
  it("computes loss", () => {
    expect(packetLossPct(4, 3)).toBe(25);
  });
});
