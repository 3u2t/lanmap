import { describe, expect, it } from "vitest";
import { ipFromUrl, parseSsdpResponse } from "./ssdp";

describe("parseSsdpResponse", () => {
  it("parses a hue bridge answer", () => {
    const raw =
      "HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=100\r\nLOCATION: http://192.168.178.44:80/description.xml\r\nSERVER: Linux UPnP/1.0\r\nST: upnp:rootdevice\r\nUSN: uuid:abc::upnp:rootdevice\r\n\r\n";
    expect(parseSsdpResponse(raw)).toMatchObject({
      location: "http://192.168.178.44:80/description.xml",
      st: "upnp:rootdevice",
    });
  });
  it("rejects non-http", () => {
    expect(parseSsdpResponse("M-SEARCH * HTTP/1.1\r\nST: ssdp:all\r\n\r\n")).toBeNull();
    expect(parseSsdpResponse("")).toBeNull();
  });
});

describe("ipFromUrl", () => {
  it("extracts v4", () => {
    expect(ipFromUrl("http://192.168.178.1:1900/root.xml")).toBe("192.168.178.1");
    expect(ipFromUrl("https://[fe80::1]/x")).toBeNull();
    expect(ipFromUrl("not a url")).toBeNull();
  });
});
