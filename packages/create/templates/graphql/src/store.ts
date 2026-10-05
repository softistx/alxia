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
