import { alxia, defineHook } from '@alxia/core';
import { z } from 'zod';

const Todo = z.object({ id: z.number(), title: z.string(), done: z.boolean() });
const NewTodo = z.object({ title: z.string().min(1) });

/** Set API_KEY in the environment: this default is for development. */
export const apiKey = Bun.env['API_KEY'] ?? 'dev-key';

// A hook of the routes it is given to: it answers 401 without the key, and
// that 401 joins the type of each, so the client reads it.
const requireKey = defineHook(({ request, reply }) =>
	request.headers.get('x-api-key') === apiKey
		? undefined
		: reply(401, { error: 'unauthorized' as const }),
);

const todos: z.infer<typeof Todo>[] = [];

export const app = alxia()
	.decorate({ todos })
	.post(
		'/todos',
		[requireKey],
		{ body: NewTodo, response: { 201: Todo } },
		({ body, todos, reply }) => {
			const todo = { id: todos.length + 1, title: body.title, done: false };
			todos.push(todo);
			return reply.created(todo);
		},
	);

export type App = typeof app;
