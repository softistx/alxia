import { alxia, defineMiddleware, responds, validate } from "@alxia/core";
import { z } from "zod";

const Todo = z.object({ id: z.number(), title: z.string(), done: z.boolean() });
const NewTodo = z.object({ title: z.string().min(1) });

/** Set API_KEY in the environment: this default is for development. */
export const apiKey = Bun.env["API_KEY"] ?? "dev-key";

// A middleware of the routes it is given to: it answers 401 without the key,
// before the body is read.
const requireKey = defineMiddleware(({ request, reply }, next) =>
  request.headers.get("x-api-key") === apiKey
    ? next()
    : reply(401, { error: "unauthorized" as const }),
);

const todos: z.infer<typeof Todo>[] = [];

export const app = alxia()
  .decorate({ todos })
  .post(
    "/todos",
    requireKey,
    validate({ body: NewTodo }),
    responds({ 201: Todo }),
    ({ body, todos, reply }) => {
      const todo = { id: todos.length + 1, title: body.title, done: false };
      todos.push(todo);
      return reply.created(todo);
    },
  );

export type App = typeof app;
