// `react-router dev` on a free port: Vite's scripts carry the nonce too.
import { afterAll, beforeAll, describe, test } from "bun:test";
import {
  browser,
  expectNonces,
  ROOT,
  type Server,
} from "../test/server-helpers";

describe("react-router dev", () => {
  let get: Server["get"];
  let child: ReturnType<typeof Bun.spawn> | undefined;

  beforeAll(async () => {
    // A free port, for Vite's --strictPort.
    const probe = Bun.serve({ port: 0, fetch: () => new Response() });
    const port = probe.port;
    await probe.stop();
    child = Bun.spawn(
      [
        process.execPath,
        "--bun",
        "react-router",
        "dev",
        "--port",
        String(port),
        "--strictPort",
      ],
      { cwd: ROOT, stdout: "pipe", stderr: "pipe" },
    );
    const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
    let out = "";
    // Vite colours the port where CI asks for colour (GitHub Actions does):
    // read the output without its escape codes.
    while (!Bun.stripANSI(out).includes(`:${port}/`)) {
      const { done, value } = await reader.read();
      if (done) throw new Error(`react-router dev exited: ${out}`);
      out += new TextDecoder().decode(value);
    }
    reader.releaseLock();
    void (async () => {
      for await (const _ of child.stdout as ReadableStream);
    })();
    void (async () => {
      for await (const _ of child.stderr as ReadableStream);
    })();
    const base = `http://localhost:${port}`;
    get = (path, init = {}) =>
      fetch(new URL(path, base), {
        redirect: "manual",
        ...init,
        headers: { ...browser, ...init.headers },
      });
  }, 30_000);
  afterAll(async () => {
    // SIGTERM: the CLI forwards it to the process it relaunched.
    child?.kill("SIGTERM");
    await child?.exited;
  });

  test("Vite's scripts and React Router's carry the nonce too", async () => {
    await expectNonces(get);
  });
});
