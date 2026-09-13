import { describe, expect, it } from "vitest";
import { estimateHops, parseProbe } from "./topology";
import type { ProbeResult } from "./topology";

describe("parseProbe", () => {
  it("detects linux reply", () => {
    expect(parseProbe("64 bytes from 192.168.178.1: icmp_seq=1 ttl=64 time=1.23 ms\n1 packets transmitted, 1 received")).toBe("reply");
  });
  it("detects linux ttl exceeded", () => {
    expect(parseProbe("From 192.168.178.1 icmp_seq=1 Time to live exceeded")).toBe("exceeded");
  });
  it("detects windows reply", () => {
    expect(parseProbe("Reply from 192.168.178.20: bytes=32 time=2ms TTL=64")).toBe("reply");
  });
  it("detects windows ttl expired", () => {
    expect(parseProbe("Reply from 192.168.178.1: TTL expired in transit.")).toBe("exceeded");
  });
  it("detects german windows ttl", () => {
    expect(parseProbe("Antwort von 192.168.178.1: TTL bei der Übertragung abgelaufen.")).toBe("exceeded");
  });
  it("detects timeout as none", () => {
    expect(parseProbe("Request timed out.\n\nPackets: Sent = 1, Received = 0")).toBe("none");
    expect(parseProbe("")).toBe("none");
  });
});

describe("estimateHops", () => {
  const seq = (...rs: ProbeResult[]) => {
    let i = 0;
    return async () => rs[Math.min(i++, rs.length - 1)];
  };
  it("returns 1 for direct reply", async () => {
    expect(await estimateHops("10.0.0.5", 500, seq("reply"))).toBe(1);
  });
  it("counts exceeded hops", async () => {
    expect(await estimateHops("10.0.0.5", 500, seq("exceeded", "exceeded", "reply"))).toBe(3);
  });
  it("returns null when host is down", async () => {
    expect(await estimateHops("10.0.0.5", 500, seq("none"))).toBeNull();
  });
  it("returns null when too far", async () => {
    expect(await estimateHops("10.0.0.5", 500, seq("exceeded"), 3)).toBeNull();
  });
});
