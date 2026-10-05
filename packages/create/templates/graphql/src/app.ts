import { health } from "@alxia/core";
import { graphql } from "@alxia/graphql";
import { base } from "./context";
import { schema } from "./schema";

// The probes (GET /health, GET /ready), then POST and GET /graphql, behind
// the base's middlewares. Subscriptions are served over server-sent events.
// The IDE (GraphiQL, on a browser's GET) follows alxia's dev switch: on
// under `bun dev` (NODE_ENV=development), off otherwise.
export const app = base
  .plugin(health())
  .plugin((app) => graphql(app, { schema }));

export type App = typeof app;
