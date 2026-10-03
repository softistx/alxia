import { createContext } from "react-router";
import type { User } from "./session.server";

/** The signed-in user, as a React Router context key: set by app/server.ts. */
export const userContext = createContext<User | null>(null);
