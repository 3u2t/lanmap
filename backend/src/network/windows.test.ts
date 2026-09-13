import { describe, expect, it } from "vitest";
import { parseWindowsArp } from "./neighbors.js";
import { parseWindowsRoute } from "./interfaces.js";

describe("parseWindowsArp", () => {
  it("parses arp -a output", () => {
    const text = `
Interface: 192.168.178.62 --- 0x8
  Internet Address      Physical Address      Type
  192.168.178.1         aa-bb-cc-dd-ee-ff     dynamic
  192.168.178.44        11-22-33-44-55-66     dynamic
`;
    const out = parseWindowsArp(text);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ ip: "192.168.178.1", mac: "AA:BB:CC:DD:EE:FF" });
    expect(out[1].ip).toBe("192.168.178.44");
  });
  it("handles empty", () => {
    expect(parseWindowsArp("")).toEqual([]);
  });
});

describe("parseWindowsRoute", () => {
  it("finds 0.0.0.0 gateway", () => {
    const text = `
Active Routes:
Network Destination        Netmask          Gateway       Interface  Metric
          0.0.0.0          0.0.0.0      192.168.178.1    192.168.178.62     35
        127.0.0.0        255.0.0.0         On-link         127.0.0.1    331
`;
    expect(parseWindowsRoute(text)).toBe("192.168.178.1");
  });
  it("returns null when no default", () => {
    expect(parseWindowsRoute("No routes")).toBeNull();
  });
});
