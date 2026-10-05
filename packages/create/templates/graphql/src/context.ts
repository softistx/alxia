import { alxia, defineMiddleware } from "@alxia/core";
import type { GraphQLContext } from "@alxia/graphql";
import { env } from "./env";
import { db } from "./store";

// Reads the bearer token: `viewer` is the user it names, or null. A query
// may be anonymous, so this refuses nothing; a resolver that needs a user
// refuses (`addNote`). `viewer` is typed in every resolver.
const viewerOf = defineMiddleware(({ request }, next) => {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  const id = token === undefined ? undefined : db.tokens.get(token);
  return next({
    viewer: (id === undefined ? undefined : db.users.get(id)) ?? null,
  });
});

// The base: what every resolver reads, decorated or derived here.
export const base = alxia().decorate({ env, db }).use(viewerOf);

// A resolver's context: Yoga's, and the base's (`env`, `db`, `viewer`).
// The generated `Resolvers` takes it (codegen.ts: `contextType`).
export type Context = GraphQLContext<typeof base>;
