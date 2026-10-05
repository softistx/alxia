import { alxia } from "@alxia/core";
import type { Todo } from "./generated/types";

const todos: Todo[] = [];

// The base: what every route reads, decorated or derived here. It is
// registered below, so a route file reads it with no import of the app.
// alxia's own errors — a 400 the schemas refuse, a 404 no route matches, a
// 500 — are RFC 9457 problems, as openapi.yaml declares them.
export const base = alxia({ errors: "problem" }).decorate({ todos });

// Register the base, never the app: the app mounts the route files, whose
// type reads this, and would then be typed by itself.
declare module "@alxia/core" {
  interface Register {
    context: typeof base;
  }
}
