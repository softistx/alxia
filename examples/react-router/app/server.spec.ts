// The app as it ships: built by `react-router build`, run with
// `bun build/server/index.js` on a free port, asked over HTTP as a browser
// would, with app/server.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  assetOf,
  build,
  expectNonces,
  ROOT,
  type Server,
  start,
  text,
} from "../test/server-helpers";

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
