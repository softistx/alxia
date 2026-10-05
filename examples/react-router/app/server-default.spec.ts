// The app built without app/server.ts, on the default server, and its Vite
// config as built for Bun.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { resolveConfig } from "vite";
import {
  assetOf,
  build,
  ROOT,
  type Server,
  start,
} from "../test/server-helpers";

describe("the default server, with no app/server.ts", () => {
  // A copy beside the example, so it resolves the same node_modules, with
  // no server file and one route that knows nothing of alxia.
  const root = join(ROOT, `.default-${process.pid}`);
  let server: Server;

  beforeAll(async () => {
    await cp(join(ROOT, "app"), join(root, "app"), {
      recursive: true,
      filter: (path) => !path.endsWith(".spec.ts"),
    });
    for (const file of [
      "package.json",
      "react-router.config.ts",
      "vite.config.ts",
    ]) {
      await cp(join(ROOT, file), join(root, file));
    }
    await rm(join(root, "app", "server.ts"));
    await Bun.write(
      join(root, "app", "routes.ts"),
      'import { index } from "@react-router/dev/routes";\n\nexport default [index("routes/plain.tsx")];\n',
    );
    await Bun.write(
      join(root, "app", "routes", "plain.tsx"),
      "export default function Plain() {\n  return <h1>Plain</h1>;\n}\n",
    );
    await build(root);
    server = await start(root);
  }, 30_000);
  afterAll(async () => {
    await server?.stop();
    await rm(root, { recursive: true, force: true });
  });

  test("serves the pages and the client's files, with none of the middlewares", async () => {
    const page = await server.get("/");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("<h1>Plain</h1>");
    expect(page.headers.get("content-security-policy")).toBeNull();
    expect(page.headers.get("x-request-id")).toBeNull();

    const served = await server.get(assetOf(html));
    expect(served.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    const missing = await server.get("/assets/nothing.js");
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "not_found" });
  });
});

describe("built for Bun", () => {
  test("the ssr environment resolves the bun condition, leaves bun and bun:* external and targets esnext", async () => {
    const config = await resolveConfig(
      { root: ROOT, logLevel: "silent" },
      "build",
      "production",
    );
    const ssr = config.environments.ssr;
    expect(ssr?.resolve.conditions).toContain("bun");
    expect(ssr?.resolve.externalConditions).toContain("bun");
    expect(ssr?.resolve.builtins).toContain("bun");
    expect(ssr?.resolve.builtins.map(String)).toContain(String(/^bun:/));
    expect(ssr?.build.target).toBe("esnext");
  });
});
