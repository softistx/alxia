/**
 * The `api` template: an alxia app with Zod, one validated route behind a
 * hook of its own, a spec that calls it in process and through the typed
 * client, and the scripts to run, test, typecheck and build it.
 */
import type { Manifest } from '../registry';
import type { AlxiaPackage } from '../versions';

/**
 * The template's manifest. The versions of `zod`, `typescript` and
 * `@types/bun` are where it starts: `bumpDependencies` moves each to the
 * registry's newest within alxia's peer ranges.
 */
export function apiManifest(
	name: string,
	alxia: Record<AlxiaPackage, string>,
): Manifest {
	return {
		name,
		private: true,
		type: 'module',
		scripts: {
			dev: 'bun --watch src/server.ts',
			build: 'bun build src/server.ts --target=bun --outdir=dist',
			start: 'bun dist/server.js',
			test: 'bun test',
			typecheck: 'tsc --noEmit',
		},
		dependencies: {
			'@alxia/core': alxia['@alxia/core'],
			zod: '^4.2.0',
		},
		devDependencies: {
			'@alxia/client': alxia['@alxia/client'],
			'@types/bun': '^1.4.2',
			typescript: '^6.0.3',
		},
	};
}

const APP = `import { alxia, defineHook } from '@alxia/core';
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
`;

const SERVER = `import { app } from './app';

const server = app.listen(Number(Bun.env['PORT'] ?? 3000));
console.log(\`listening on \${server.url}\`);
`;

const SPEC = `import { expect, test } from 'bun:test';
import { client } from '@alxia/client';
import { apiKey, app } from './app';

const json = { 'content-type': 'application/json', 'x-api-key': apiKey };

test('creates a todo from JSON', async () => {
	const response = await app.request('/todos', {
		method: 'POST',
		headers: json,
		body: JSON.stringify({ title: 'Write a route' }),
	});
	expect(response.status).toBe(201);
	expect(await response.json()).toEqual({
		id: expect.any(Number),
		title: 'Write a route',
		done: false,
	});
});

test('refuses an empty title with a 400 naming it', async () => {
	const response = await app.request('/todos', {
		method: 'POST',
		headers: json,
		body: JSON.stringify({ title: '' }),
	});
	expect(response.status).toBe(400);
	expect((await response.json()).issues[0].path).toEqual(['title']);
});

test('the typed client reads each status the route answers', async () => {
	// Given the app itself, the client calls its fetch in process.
	const api = client(app, { headers: { 'x-api-key': apiKey } });
	const created = await api.post('/todos', { body: { title: 'Call it typed' } });
	if (created.status !== 201) throw new Error(\`got \${created.status}\`);
	expect(created.data.title).toBe('Call it typed'); // data is the Todo schema's type

	const anonymous = await client(app).post('/todos', { body: { title: 'No key' } });
	expect(anonymous.status).toBe(401);
	if (anonymous.status === 401) expect(anonymous.data.error).toBe('unauthorized');
});
`;

const TSCONFIG = `{
	"compilerOptions": {
		"types": ["bun"],
		"lib": ["ESNext", "DOM"],
		"target": "ESNext",
		"module": "ESNext",
		"moduleDetection": "force",
		"moduleResolution": "bundler",
		"verbatimModuleSyntax": true,
		"noEmit": true,
		"skipLibCheck": true,
		"resolveJsonModule": true,
		"strict": true,
		"noImplicitOverride": true,
		"noImplicitReturns": true,
		"noFallthroughCasesInSwitch": true,
		"noUncheckedIndexedAccess": true,
		"exactOptionalPropertyTypes": true,
		"noPropertyAccessFromIndexSignature": true,
		"noUnusedLocals": true,
		"noUnusedParameters": true,
		"forceConsistentCasingInFileNames": true
	},
	"include": ["src"]
}
`;

const GITIGNORE = `node_modules
dist
*.log
.DS_Store
.env
.env.local
`;

const readme = (name: string) => `# ${name}

An [alxia](https://github.com/softistx/alxia) app with
[Zod](https://zod.dev), made with \`bun create @alxia\`.

\`\`\`sh
bun dev          # http://localhost:3000, restarted on every change
bun test         # src/app.spec.ts: in process, and through the typed client
bun run typecheck
bun run build    # dist/server.js, run with \`bun start\`
\`\`\`

\`\`\`sh
curl -X POST localhost:3000/todos \\
  -H 'content-type: application/json' -H 'x-api-key: dev-key' \\
  -d '{"title":"Write a route"}'
\`\`\`

- \`src/app.ts\`: the app. \`POST /todos\` validates its body with Zod, and
  its own hook, \`requireKey\`, answers 401 without the \`x-api-key\` header.
  Set \`API_KEY\` in the environment outside development.
- \`src/server.ts\`: listens on \`PORT\`, 3000 by default.
- \`src/app.spec.ts\`: \`app.request()\` and \`@alxia/client\`, no port.

Next: [Getting started](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/getting-started.md)
and the rest of [\`@alxia/core\`'s guide](https://github.com/softistx/alxia/tree/develop/packages/core/docs).
`;

/** The template's files but its manifest, by path. */
export function apiFiles(name: string): Record<string, string> {
	return {
		'src/app.ts': APP,
		'src/server.ts': SERVER,
		'src/app.spec.ts': SPEC,
		'tsconfig.json': TSCONFIG,
		'.gitignore': GITIGNORE,
		'README.md': readme(name),
	};
}
