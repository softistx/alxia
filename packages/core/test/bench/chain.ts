/**
 * The chain's cost: a route behind 3 middlewares, in the middleware form,
 * against the same route behind a list of 3 hooks, the form of 0.3, and
 * behind the same 3 given to `use`. Run from the package:
 * `bun test/bench/chain.ts`. Prints the median time of a request in each
 * form and the ratios; the middleware forms should stay within 10% of the
 * list.
 *
 * Measured when `next()` learned to settle soundly — a middleware returning
 * nothing, returning before its `next()` settled, or leaving its error
 * unread — against the commit before, on one machine: the middleware form
 * 1180 → 1330 ns (+12%, most of it the handler each `next()` attaches so
 * that an error nobody reads is never an unhandled rejection), the list
 * 1300 → 1085 ns and `use()` 1400 → 1345 ns, since a route with no schema
 * of its own runs no validation step any more. The ratio is about 1.22 as
 * a result, past the 10% this bench asks: reported, and accepted for the
 * soundness.
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

const scoped = alxia()
	.use(ma, mb, mc)
	.get('/', ({ c, reply }) => reply(200, c));

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
await round(scoped);
const times = {
	hooks: [] as number[],
	middlewares: [] as number[],
	scoped: [] as number[],
};
for (let i = 0; i < ROUNDS; i++) {
	times.hooks.push(await round(hooks));
	times.middlewares.push(await round(middlewares));
	times.scoped.push(await round(scoped));
}
const old = median(times.hooks);
const now = median(times.middlewares);
const used = median(times.scoped);
console.log(`[hooks] list, 3 hooks:   ${old.toFixed(0)} ns/request`);
console.log(`middlewares, 3:          ${now.toFixed(0)} ns/request`);
console.log(`use(), 3:                ${used.toFixed(0)} ns/request`);
console.log(`ratio:                   ${(now / old).toFixed(3)}`);
console.log(`ratio, use():            ${(used / old).toFixed(3)}`);
