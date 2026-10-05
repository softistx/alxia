import { GraphQLError } from "graphql";
import type { Resolvers } from "./generated/resolvers";
import { type NoteRecord, pubsub } from "./store";

// `Resolvers` is generated from schema.graphql: a field the schema lacks, or
// a return the schema's type refuses, is a compile error.
export const resolvers: Resolvers = {
  Query: {
    me: (_, __, { viewer }) => viewer,
    notes: (_, __, { db }) => db.notes,
  },
  Mutation: {
    addNote: (_, { text }, { viewer, db }) => {
      if (viewer === null) {
        throw new GraphQLError("Sign in to add a note", {
          extensions: { code: "UNAUTHENTICATED" },
        });
      }
      const note = {
        id: String(db.notes.length + 1),
        text,
        authorId: viewer.id,
      };
      db.notes.push(note);
      pubsub.publish("noteAdded", note);
      return note;
    },
  },
  Subscription: {
    noteAdded: {
      subscribe: () => pubsub.subscribe("noteAdded"),
      resolve: (note: NoteRecord) => note,
    },
  },
  Note: {
    // The notes of one query load their authors in one batch (N+1 otherwise).
    author: (note, _, { loaders }) => loaders.user.load(note.authorId),
  },
};
