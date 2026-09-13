import { describe, expect, it } from "vitest";
import { filterDevices, sortDevices } from "./filter";
import type { Device } from "@lanmap/shared";

const devs = (over: Partial<Device>[]): Device[] =>
  over.map((o, i) => ({
    id: String(i),
    ip: `192.168.1.${i + 1}`,
    status: "online",
    monitored: false,
    ignored: false,
    consecutiveFailures: 0,
    firstSeen: 1,
    lastSeen: 2,
    ...o,
  })) as Device[];

describe("filterDevices", () => {
  it("matches hostname/ip/mac case-insensitively", () => {
    const ds = devs([{ hostname: "Printer" }, { mac: "AA:BB:CC:DD:EE:FF" }]);
    expect(filterDevices(ds, "print", "")).toHaveLength(1);
    expect(filterDevices(ds, "aa:bb", "")).toHaveLength(1);
  });
  it("filters by status", () => {
    const ds = devs([{ status: "offline" }, { status: "online" }]);
    expect(filterDevices(ds, "", "offline")).toHaveLength(1);
  });
});

describe("sortDevices", () => {
  it("sorts by latency, unknown last", () => {
    const ds = devs([{ latencyMs: 50 }, { latencyMs: null }, { latencyMs: 5 }]);
    expect(sortDevices(ds, "latency").map((d) => d.latencyMs)).toEqual([5, 50, null]);
  });
});
