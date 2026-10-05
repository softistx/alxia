import { alxia } from "@alxia/core";

export const app = alxia().get("/", ({ reply }) =>
  reply(200, { hello: "world" }),
);

// Only when this file is the entry: the test imports `app` and listens on
// no port.
if (import.meta.main) {
  // In dev, the URL and the route table; in production, the URL alone. On
  // SIGINT and SIGTERM, listen drains the requests in flight and exits.
  app.listen({
    port: Number(Bun.env["PORT"] ?? 3000),
    onListen: ({ dev, table, url }) =>
      console.log(dev ? table : `listening on ${url}`),
  });
}
