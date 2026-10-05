import { createPubSub } from "graphql-yoga";

export interface UserRecord {
  id: string;
  name: string;
}

export interface NoteRecord {
  id: string;
  text: string;
  authorId: string;
}

// An in-memory store, for the example: swap it for your database.
export const db = {
  users: new Map<string, UserRecord>([["1", { id: "1", name: "Ada" }]]),
  // Bearer tokens and the user each one is: for development. Use a real
  // session or a JWT (`@alxia/jwt`'s `bearer`) outside it.
  tokens: new Map([["ada-token", "1"]]),
  notes: [] as NoteRecord[],
};

// What a subscription streams: `addNote` publishes, `noteAdded` subscribes.
// One process only: across several, back it with a broker.
export const pubsub = createPubSub<{ noteAdded: [NoteRecord] }>();

// How many times the store was asked for users: a stand-in for a database's
// query log. `findUsers` is one query however many ids it is given.
export const queries = { users: 0 };

// The batch behind `loaders.user` (src/loaders.ts): one `WHERE id IN (...)` in
// a database. It answers each id in order, an Error for one that is missing.
export async function findUsers(
  ids: readonly string[],
): Promise<(UserRecord | Error)[]> {
  queries.users += 1;
  return ids.map((id) => db.users.get(id) ?? new Error(`No user ${id}`));
}
