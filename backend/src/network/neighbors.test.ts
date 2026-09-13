import { describe, expect, it } from "vitest";
import { parseArpTable, parseIpNeigh } from "../network/neighbors.js";

const ARP = `IP address       HW type     Flags       HW address            Mask     Device
192.168.1.1      0x1         0x2         aa:bb:cc:dd:ee:01     *        eth0
192.168.1.20     0x1         0x2         aa:bb:cc:dd:ee:14     *        eth0
`;
describe("parseArpTable", () => {
  it("parses entries", () => {
    const r = parseArpTable(ARP);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ ip: "192.168.1.1", mac: "AA:BB:CC:DD:EE:01", iface: "eth0" });
  });
});

describe("parseIpNeigh", () => {
  it("skips FAILED, keeps STALE without mac", () => {
    const t = `192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:01 REACHABLE
192.168.1.99 dev eth0  STALE
192.168.1.100 dev eth0  FAILED`;
    const r = parseIpNeigh(t);
    expect(r.map((x) => x.ip)).toEqual(["192.168.1.1", "192.168.1.99"]);
  });
});
