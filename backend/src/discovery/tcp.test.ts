import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { probePort, scanPorts } from "./tcp";

describe("tcp scan", () => {
  it("finds an open localhost port and no closed one", async () => {
    const srv = createServer((s) => s.end());
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    try {
      expect(await probePort("127.0.0.1", port, 500)).toBe(true);
      expect(await probePort("127.0.0.1", 1, 300)).toBe(false);
      const open = await scanPorts("127.0.0.1", [1, port], 500, 2);
      expect(open).toEqual([port]);
    } finally {
      srv.close();
    }
  });
});
