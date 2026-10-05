// The app as it ships: built by `react-router build`, run with
// `bun build/server/index.js` on a free port, asked over HTTP as a browser
// would. Once with app/server.ts, once without it, on the default server.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { resolveConfig } from "vite";

const ROOT = join(import.meta.dir, "..");

// Bun's own user agent is a bot to isbot, which gets the finished page,
// never a stream.
const browser = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
};

/** React's text separators, out of the way of an assertion. */
const text = (html: string) => html.replaceAll("<!-- -->", "");

async function build(root: string) {
  const built = await $`${process.execPath} --bun react-router build`
    .cwd(root)
    // bun test sets NODE_ENV=test; a build for production wants its own.
    .env({ ...process.env, NODE_ENV: "production" })
    .quiet()
    .nothrow();
  if (built.exitCode !== 0) {
    throw new Error(
      `react-router build failed:\n${built.stdout}\n${built.stderr}`,
    );
  }
}

/** Runs build/server/index.js on a free port, as `bun run start` does. */
async function start(root: string) {
  const child = Bun.spawn(
    [process.execPath, join(root, "build", "server", "index.js")],
    {
      cwd: root,
      env: { ...process.env, PORT: "0", HOST: "127.0.0.1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const reader = child.stdout.getReader();
  let out = "";
  let url: string | undefined;
  while (url === undefined) {
    const { done, value } = await reader.read();
    if (done) throw new Error(`the server exited: ${out}`);
    out += new TextDecoder().decode(value);
    url = out.match(/alxia listening on (\S+)/)?.[1];
  }
  reader.releaseLock();
  // Drained, so the server never blocks writing its logs to a full pipe.
  void (async () => {
    for await (const _ of child.stdout);
  })();
  void (async () => {
    for await (const _ of child.stderr);
  })();
  const get = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, url), {
      redirect: "manual",
      ...init,
      headers: { ...browser, ...init.headers },
    });
  const stop = async () => {
    child.kill("SIGTERM");
    await child.exited;
  };
  return { get, stop };
}

type Server = Awaited<ReturnType<typeof start>>;

/** Every `<script …>` and module preload of a page: what a nonce must cover. */
const scriptsOf = (html: string) =>
  html.match(/<script\b[^>]*>|<link rel="modulepreload"[^>]*>/g) ?? [];

/**
 * The home page and the streamed one, twice each: every script carries the
 * nonce the response's policy allows, and no two responses share one.
 */
async function expectNonces(get: Server["get"]) {
  const seen = new Set<string>();
  for (const path of ["/", "/", "/slow", "/slow"]) {
    const response = await get(path);
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonce = policy.match(/'nonce-([^']+)'/)?.[1] as string;
    expect(nonce).toMatch(/^[\w+/]{22}==$/);
    const scripts = scriptsOf(await response.text());
    expect(scripts.length).toBeGreaterThan(2);
    for (const script of scripts) expect(script).toContain(`nonce="${nonce}"`);
    seen.add(nonce);
  }
  expect(seen.size).toBe(4);
}

/** The first entry client bundle a page links to. */
const assetOf = (html: string) =>
  html.match(/\/assets\/entry\.client-[\w-]+\.js/)?.[0] as string;

describe("customised by app/server.ts", () => {
  let server: Server;
  const post = (path: string, form: Record<string, string>, cookie?: string) =>
    server.get(path, {
      method: "POST",
      body: new URLSearchParams(form),
      headers: cookie === undefined ? {} : { cookie },
    });
  const signIn = async (name: string) => {
    const response = await post("/login", { name });
    return (response.headers.get("set-cookie") ?? "").split(";")[0] as string;
  };

  beforeAll(async () => {
    await build(ROOT);
    server = await start(ROOT);
  }, 30_000);
  afterAll(() => server?.stop());

  test("the home page reads the session's user through alxiaOf", async () => {
    const guest = text(await (await server.get("/")).text());
    expect(guest).toContain(
      '<a href="/login" data-discover="true">Sign in</a>',
    );

    const cookie = await signIn("Ada");
    const page = await server.get("/", { headers: { cookie } });
    expect(text(await page.text())).toContain("Signed in as Ada");
  });

  test("the sign-in action sets the session cookie and redirects, or answers 400", async () => {
    const signedIn = await post("/login", { name: "Ada" });
    expect(signedIn.status).toBe(302);
    expect(signedIn.headers.get("location")).toBe("/");
    expect(signedIn.headers.get("set-cookie")).toMatch(
      /^sid=[\w-]+; Path=\/; HttpOnly; SameSite=Lax$/,
    );

    const refused = await post("/login", { name: " " });
    expect(refused.status).toBe(400);
    expect(refused.headers.get("set-cookie")).toBeNull();
    expect(await refused.text()).toContain('<p role="alert">Enter a name</p>');
  });

  test("the todo action answers the schema's message with a 400, and adds under the user's name", async () => {
    const refused = await post("/todos", { title: "" });
    expect(refused.status).toBe(400);
    expect(await refused.text()).toContain(
      '<p role="alert">Write something to do</p>',
    );

    const cookie = await signIn("Grace");
    const added = await post("/todos", { title: "Read the guide" }, cookie);
    expect(added.status).toBe(200);
    // By name: getLoadContext set the user on React Router's own key.
    expect(text(await added.text())).toContain(
      "Read the guide <small>by Grace</small>",
    );
  });

  test("POST /api/todos validates its body with the same schema", async () => {
    const json = (body: unknown) =>
      server.get("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const refused = await json({ title: "" });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      error: "validation",
      issues: [
        { target: "body", path: ["title"], message: "Write something to do" },
      ],
    });

    const created = await json({ title: "From a client" });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      title: "From a client",
      by: "api",
    });
    expect(await (await server.get("/todos")).text()).toContain(
      "From a client",
    );
  });

  test("the streamed page sends its shell and fallback before the deferred value", async () => {
    const started = performance.now();
    const response = await server.get("/slow", {
      headers: { "accept-encoding": "identity" },
    });
    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let first: { at: number; text: string } | undefined;
    let all = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      first ??= { at: performance.now() - started, text: chunk };
      all += chunk;
    }
    const ended = performance.now() - started;
    expect(first?.text).toContain('id="fallback"');
    expect(first?.text).not.toContain("Here after 400 ms");
    expect(all).toContain("Here after 400 ms");
    expect(first?.at ?? Infinity).toBeLessThan(ended - 200);
  });

  test("a URL no route matches is the template's 404", async () => {
    const response = await server.get("/no-such-page");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain(
      "The requested page could not be found.",
    );
  });

  test("a page carries the logger's id, the secure headers and compression", async () => {
    const response = await server.get("/", {
      headers: { "accept-encoding": "gzip" },
    });
    const policy = response.headers.get("content-security-policy") ?? "";
    expect(policy).toMatch(/script-src 'self' 'nonce-[\w+/]+={0,2}';/);
    expect(policy).toContain("form-action 'self'");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-request-id")).toBeString();
    expect(response.headers.get("content-encoding")).toBe("gzip");
  });

  test("every script carries the nonce of the page's own policy, a fresh one per request", async () => {
    await expectNonces(server.get);
  });

  test("a hashed asset is served immutable", async () => {
    const asset = assetOf(await (await server.get("/")).text());
    const served = await server.get(asset);
    expect(served.status).toBe(200);
    expect(served.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });
});

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

describe("the default server, with no app/server.ts", () => {
  // A copy beside the example, so it resolves the same node_modules, with
  // no server file and one route that knows nothing of alxia.
  const root = join(ROOT, `.default-${process.pid}`);
  let server: Server;

  beforeAll(async () => {
    await cp(join(ROOT, "app"), join(root, "app"), { recursive: true });
    for (const file of [
      "package.json",
      "react-router.config.ts",
      "vite.config.ts",
    ]) {
      await cp(join(ROOT, file), join(root, file));
    }
    await rm(join(root, "app", "server.ts"));
    await rm(join(root, "app", "server.spec.ts"));
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
