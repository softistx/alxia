// Optional for a new app: without this file the plugin serves it with a
// default server. With it, alxia's hooks run around every page and its
// data. This example's routes read what it derives (`user`, `log`), so
// here it is required.
import { compress } from "@alxia/compress";
import { logger } from "@alxia/logger";
import { createServer } from "@alxia/react-router";
import { secureHeaders } from "@alxia/secure-headers";
import { userContext } from "./context";
import { userOf } from "./session.server";
import { addTodo, NewTodo, Todo } from "./todos.server";

const server = createServer({
  configure: (app) =>
    app
      .use(logger())
      .use(compress())
      .use(
        secureHeaders({
          // The default, `default-src 'none'; form-action 'none'`, suits an
          // API: on a page it blocks React Router's inline scripts, so the
          // page never hydrates, and every <Form> post. This allows the
          // page's own, and the template's Google Fonts.
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src https://fonts.gstatic.com",
            "img-src 'self' data:",
            "connect-src 'self'",
            "form-action 'self'",
            "base-uri 'self'",
            "frame-ancestors 'none'",
          ].join("; "),
        }),
      )
      // A tiny session: the user, from the cookie the sign-in sets. Every
      // hook reads the request's cookies as `cookies`.
      .derive(({ cookies }) => ({ user: userOf(cookies) }))
      // alxia's own JSON route, validated by its schema. Under /api, a
      // prefix no page uses.
      .post(
        "/api/todos",
        { body: NewTodo, response: { 201: Todo } },
        ({ body, user, reply }) =>
          reply.created(addTodo(body.title, user?.name ?? "api")),
      ),
  // React Router's own key, for a route that reads context.get(userContext)
  // rather than alxiaOf(context).
  getLoadContext: ({ user }, context) => context.set(userContext, user),
});

export default server;

// What alxiaOf(context) reads in the loaders, with no type argument.
declare module "@alxia/react-router" {
  interface Register {
    server: typeof server;
  }
}
