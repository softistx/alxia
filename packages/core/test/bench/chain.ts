/**
 * The chain's cost: a route behind 3 middlewares, in the middleware form,
 * against the same route behind a list of 3 hooks, the form of 0.3. Run
 * from the package: `bun test/bench/chain.ts`. Prints the median time of a
 * request in each form and the ratio; the middleware form should stay
 * within 10% of the list.
 */
import { alxia, defineHook, defineMiddleware } from '@alxia/core';

const ROUNDS = 7;
const REQUESTS = 50_000;

const a = defineHook(() => ({ a: 1 }));
const b = defineHook<{ a: number }>()(({ a }) => ({ b: a + 1 }));
const c = defineHook<{ b: number }>()(({ b }) => ({ c: b + 1 }));

const ma = defineMiddleware((_ctx, next) => next({ a: 1 }));
const mb = defineMiddleware<{ a: number }>()(({ a }, next) =>
	next({ b: a + 1 }),
);
const mc = defineMiddleware<{ b: number }>()(({ b }, next) =>
	next({ c: b + 1 }),
);

const hooks = alxia().get('/', [a, b, c], ({ c, reply }) => reply(200, c));
const middlewares = alxia().get('/', ma, mb, mc, ({ c, reply }) =>
	reply(200, c),
);

const request = new Request('http://localhost/');

async function round(app: { fetch: (r: Request) => Promise<Response> }) {
	const started = Bun.nanoseconds();
	for (let i = 0; i < REQUESTS; i++) await app.fetch(request);
	return (Bun.nanoseconds() - started) / REQUESTS;
}

const median = (values: number[]) =>
	[...values].sort((x, y) => x - y)[Math.floor(values.length / 2)] ?? 0;

await round(hooks);
await round(middlewares);
const times = { hooks: [] as number[], middlewares: [] as number[] };
for (let i = 0; i < ROUNDS; i++) {
	times.hooks.push(await round(hooks));
	times.middlewares.push(await round(middlewares));
}
const old = median(times.hooks);
const now = median(times.middlewares);
console.log(`[hooks] list, 3 hooks:   ${old.toFixed(0)} ns/request`);
console.log(`middlewares, 3:          ${now.toFixed(0)} ns/request`);
console.log(`ratio:                   ${(now / old).toFixed(3)}`);
