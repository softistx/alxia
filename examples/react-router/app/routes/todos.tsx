import { alxiaOf } from "@alxia/react-router";
import { data, Form } from "react-router";
import type { Route } from "./+types/todos";
import { userContext } from "../context";
import { addTodo, listTodos, NewTodo } from "../todos.server";

export function loader() {
  return { todos: listTodos() };
}

export async function action({ request, context }: Route.ActionArgs) {
  const form = await request.formData();
  // The schema POST /api/todos validates its body with.
  const parsed = NewTodo.safeParse({ title: form.get("title") });
  if (!parsed.success) {
    return data({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  // React Router's own key, which app/server.ts's getLoadContext set.
  const user = context.get(userContext);
  addTodo(parsed.data.title, user?.name ?? "guest");
  // alxia's own context, read in a plain action with alxiaOf.
  alxiaOf(context).log.info("todo added", { by: user?.name ?? "guest" });
  return { error: undefined };
}

export default function Todos({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <main className="p-4">
      <ul>
        {loaderData.todos.map((todo) => (
          <li key={todo.id}>
            {todo.title} <small>by {todo.by}</small>
          </li>
        ))}
      </ul>
      <Form method="post">
        <input name="title" aria-label="New todo" className="border" />{" "}
        <button type="submit">Add</button>
      </Form>
      {actionData?.error && <p role="alert">{actionData.error}</p>}
    </main>
  );
}
