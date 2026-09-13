import { describe, expect, it } from "vitest";
import {
  BUILTIN_CATEGORIES,
  isPrivateCidr,
  isPrivateIp,
  listHosts,
  nextPresenceState,
  normalizeMac,
  packetLossPct,
  parseCidr,
  sameDevice,
  summarizeLatencies,
} from "./index";

describe("parseCidr", () => {
  it("parses 192.168.1.0/24", () => {
    expect(parseCidr("192.168.1.0/24")).toMatchObject({
      network: "192.168.1.0",
      broadcast: "192.168.1.255",
      mask: "255.255.255.0",
      hostCount: 256,
    });
  });
  it("rejects malformed", () => {
    expect(parseCidr("nope")).toBeNull();
    expect(parseCidr("192.168.1.1/33")).toBeNull();
    expect(parseCidr("10.0.0.1")).toBeNull();
  });
});

describe("isPrivateCidr", () => {
  it.each([["192.168.1.0/24"], ["10.0.0.0/8"], ["172.16.0.0/12"], ["169.254.0.0/16"]])(
    "allows %s",
    (c) => expect(isPrivateCidr(c)).toBe(true),
  );
  it.each([
    ["8.8.8.0/24"],
    ["1.1.1.0/24"],
    ["0.0.0.0/0"],
    ["127.0.0.0/8"],
    ["192.168.1.1"],
    ["10.0.0.0/7"],
    ["172.32.0.0/12"],
  ])("rejects %s", (c) => expect(isPrivateCidr(c)).toBe(false));
  it("allows ULA, rejects global unicast v6", () => {
    expect(isPrivateCidr("fd00::/64")).toBe(true);
    expect(isPrivateCidr("fe80::/10")).toBe(true);
    expect(isPrivateCidr("2001:db8::/32")).toBe(false);
    expect(isPrivateCidr("::1/128")).toBe(false);
  });
});

describe("isPrivateIp", () => {
  it("classifies rfc1918", () => {
    expect(isPrivateIp("192.168.0.5")).toBe(true);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("127.0.0.1")).toBe(false);
  });
});

describe("normalizeMac", () => {
  it("normalizes common formats", () => {
    expect(normalizeMac("aa:bb:cc:dd:ee:ff")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("aa-bb-cc-dd-ee-ff")).toBe("AA:BB:CC:DD:EE:FF");
    expect(normalizeMac("aabb.ccdd.eeff")).toBe("AA:BB:CC:DD:EE:FF");
  });
  it("rejects junk", () => {
    expect(normalizeMac("not-a-mac")).toBeNull();
    expect(normalizeMac("")).toBeNull();
  });
});

describe("sameDevice", () => {
  it("prefers MAC, falls back to IP", () => {
    expect(
      sameDevice(
        { mac: "aa:bb:cc:dd:ee:ff", ip: "192.168.1.2" },
        { mac: "AA-BB-CC-DD-EE-FF", ip: "192.168.1.9" },
      ),
    ).toBe(true);
    expect(sameDevice({ mac: null, ip: "192.168.1.2" }, { mac: null, ip: "192.168.1.3" })).toBe(
      false,
    );
  });
});

describe("stats", () => {
  it("packet loss", () => {
    expect(packetLossPct(10, 9)).toBe(10);
    expect(packetLossPct(0, 0)).toBe(0);
    expect(packetLossPct(3, 2)).toBe(33.3);
  });
  it("summarizes latency", () => {
    expect(summarizeLatencies([2, 4, 6])).toMatchObject({ avg: 4, min: 2, max: 6 });
    expect(summarizeLatencies([])).toBeNull();
  });
});

describe("presence", () => {
  it("needs N consecutive failures before offline", () => {
    expect(
      nextPresenceState({ probeOk: false, consecutiveFailures: 0, offlineAfterFailures: 3 }),
    ).toMatchObject({ status: "unknown" });
    expect(
      nextPresenceState({ probeOk: false, consecutiveFailures: 2, offlineAfterFailures: 3 }),
    ).toMatchObject({ status: "offline" });
    expect(
      nextPresenceState({ probeOk: true, consecutiveFailures: 5, offlineAfterFailures: 3 }),
    ).toMatchObject({ status: "online", consecutiveFailures: 0 });
  });
});

describe("listHosts", () => {
  it("lists /30, refuses /8", () => {
    expect(listHosts("192.168.1.0/30")).toEqual(["192.168.1.1", "192.168.1.2"]);
    expect(listHosts("10.0.0.0/8")).toBeNull();
  });
});

describe("categories", () => {
  it("has expected builtins", () => {
    expect(BUILTIN_CATEGORIES).toContain("Raspberry Pi");
    expect(BUILTIN_CATEGORIES).toContain("Network");
  });
});
