import { health } from "@alxia/core";
import { apiDocs } from "@alxia/openapi";
import spec from "../openapi.yaml";
import { base } from "./context";
import { env } from "./env";
import { todoRoutes } from "./routes/todos";

// The base, then the probes (GET /health, GET /ready) before any guard,
// the API reference at /docs (on in development; API_DOCS=true elsewhere),
// and the route files: each requires the base's context, so mounting one
// before it is a compile error. openapi.yaml is imported, so `bun run build`
// puts it inside dist/server.js: the image needs no copy of it.
export const app = base
  .plugin(health())
  .plugin(apiDocs({ spec, enabled: env.API_DOCS }))
  .plugin(todoRoutes);

export type App = typeof app;
