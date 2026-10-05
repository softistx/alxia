import { createSchema } from "graphql-yoga";
import typeDefs from "../schema.graphql" with { type: "text" };
import type { Context } from "./context";
import { resolvers } from "./resolvers";

export const schema = createSchema<Context>({ typeDefs, resolvers });
