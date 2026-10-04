import { defineMiddleware, defineRoutes } from "@alxia/core";
import { apiKey } from "../context";
import { operations } from "../generated/alxia";

// A middleware of the routes it is given to: it answers 401 without the key,
// before the body is read. openapi.yaml declares that 401.
const requireKey = defineMiddleware(({ request, reply }, next) =>
  request.headers.get("x-api-key") === apiKey
    ? next()
    : reply(401, { error: "unauthorized" as const }),
);

// Each route is an operation of openapi.yaml, generated into
// src/generated/alxia.ts: its method, path and schemas come from the spec,
// so the handler is all that is written here. The request is validated
// just before the handler, and every reply against the spec's responses.
// `todos` is the registered context's: defineRoutes() reads it, and the
// app that mounts these routes must give it.
export const todoRoutes = defineRoutes()
  .route(operations.listTodos, ({ todos, reply }) => reply.ok(todos))
  .route(operations.createTodo, requireKey, ({ body, todos, reply }) => {
    const todo = { id: todos.length + 1, title: body.title, done: false };
    todos.push(todo);
    return reply.created(todo);
  })
  .route(operations.getTodo, ({ params, todos, reply }) => {
    const todo = todos.find(({ id }) => id === params.id);
    return todo
      ? reply.ok(todo)
      : reply.notFound({ error: "not_found" as const });
  });
