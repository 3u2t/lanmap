import { describe, expect, it } from "vitest";
import { buildMdnsQuery, parseMdnsPacket } from "./mdns";

function fritzPacket(): Buffer {
  const header = Buffer.from([0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
  const name = Buffer.concat([Buffer.from([5]), Buffer.from("fritz"), Buffer.from([3]), Buffer.from("box"), Buffer.from([0])]);
  const meta = Buffer.alloc(10);
  meta.writeUInt16BE(1, 0);
  meta.writeUInt16BE(1, 2);
  meta.writeUInt32BE(120, 4);
  meta.writeUInt16BE(4, 8);
  return Buffer.concat([header, name, meta, Buffer.from([192, 168, 178, 1])]);
}

describe("mdns", () => {
  it("builds a PTR query", () => {
    const q = buildMdnsQuery("_http._tcp.local");
    expect(q.readUInt16BE(4)).toBe(1);
    expect(q.readUInt16BE(q.length - 4)).toBe(12);
  });
  it("parses an A answer", () => {
    const recs = parseMdnsPacket(fritzPacket());
    expect(recs).toHaveLength(1);
    expect(recs[0].name).toBe("fritz.box");
    expect(recs[0].type).toBe(1);
    expect(recs[0].addr).toBe("192.168.178.1");
  });
  it("resolves compression pointers", () => {
    const header = Buffer.from([0x00, 0x00, 0x84, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00]);
    const first = Buffer.concat([
      Buffer.from([7]), Buffer.from("printer"), Buffer.from([5]), Buffer.from("local"), Buffer.from([0]),
      Buffer.from([0, 1, 0, 1, 0, 0, 0, 120, 0, 4, 192, 168, 178, 50]),
    ]);
    const second = Buffer.concat([
      Buffer.from([0xc0, 12]),
      Buffer.from([0, 28, 0, 1, 0, 0, 0, 120, 0, 16, 0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]),
    ]);
    const recs = parseMdnsPacket(Buffer.concat([header, first, second]));
    expect(recs).toHaveLength(2);
    expect(recs[0].name).toBe("printer.local");
    expect(recs[0].addr).toBe("192.168.178.50");
    expect(recs[1].name).toBe("printer.local");
    expect(recs[1].type).toBe(28);
  });
  it("returns [] for garbage", () => {
    expect(parseMdnsPacket(Buffer.from([1, 2, 3]))).toEqual([]);
  });
});
