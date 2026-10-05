import { graphql } from "@alxia/graphql";
import { base } from "./context";
import { env } from "./env";
import { schema } from "./schema";

// POST and GET /graphql, behind the base's middlewares. Subscriptions are
// served over server-sent events. The IDE (GraphiQL, on a browser's GET) is
// for development: off in production.
export const app = base.plugin((app) =>
  graphql(app, {
    schema,
    ide: env.NODE_ENV === "production" ? false : "graphiql",
  }),
);

export type App = typeof app;
