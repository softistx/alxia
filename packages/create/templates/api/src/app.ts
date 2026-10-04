import { base } from "./context";
import { todoRoutes } from "./routes/todos";

// The base, then the route files: each requires the base's context, so
// mounting one before it is a compile error.
export const app = base.plugin(todoRoutes);

export type App = typeof app;
