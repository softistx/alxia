// The todo list, in memory: what the /todos page and POST /api/todos share,
// the schema included.
import { z } from "zod";

export const Todo = z.object({
  id: z.number(),
  title: z.string(),
  by: z.string(),
});
export type Todo = z.infer<typeof Todo>;

export const NewTodo = z.object({
  title: z.string().trim().min(1, "Write something to do").max(80),
});

const todos: Todo[] = [];

export function listTodos(): readonly Todo[] {
  return todos;
}

export function addTodo(title: string, by: string): Todo {
  const todo = { id: todos.length + 1, title, by };
  todos.push(todo);
  return todo;
}
