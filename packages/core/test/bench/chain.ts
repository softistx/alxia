/**
 * The chain's cost: a route behind 3 middlewares, in the middleware form,
 * against the same route behind a list of 3 hooks, the form of 0.3; the
 * same 3 given to `use`, the app's middlewares; and a 404, on an app with
 * none and on one with the 3 given to `use`, which a request no route
 * matches runs. Run from the package: `bun test/bench/chain.ts`. Prints
 * the median time of a request in each form and the ratios; the
 * middleware forms should stay within 10% of the list.
 *
 * #131 cost the middleware form 12% (1180 → 1330 ns on one machine): the
 * handler each `next()` attached so that an error nobody reads is never
 * an unhandled rejection. It is attached now only when the middleware
 * does not return `next()`'s promise, which the chain then passes on
 * without another `then`, and the steps that never wait run in one loop:
 * measured on the same machine, the list 1090 → 944 ns, the middleware
 * form 1325 → 1030 ns (a ratio of 1.09) and `use()` 1341 → 1007 ns.
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

const apps = {
	hooks: alxia().get('/', [a, b, c], ({ c, reply }) => reply(200, c)),
	middlewares: alxia().get('/', ma, mb, mc, ({ c, reply }) => reply(200, c)),
	scoped: alxia()
		.use(ma, mb, mc)
		.get('/', ({ c, reply }) => reply(200, c)),
	missing: alxia().get('/', ({ reply }) => reply(200, 'ok')),
	missingScoped: alxia()
		.use(ma, mb, mc)
		.get('/', ({ reply }) => reply(200, 'ok')),
};
const requests = {
	hooks: new Request('http://localhost/'),
	middlewares: new Request('http://localhost/'),
	scoped: new Request('http://localhost/'),
	missing: new Request('http://localhost/missing'),
	missingScoped: new Request('http://localhost/missing'),
};
type Name = keyof typeof apps;

async function round(name: Name) {
	const app = apps[name];
	const request = requests[name];
	const started = Bun.nanoseconds();
	for (let i = 0; i < REQUESTS; i++) await app.fetch(request);
	return (Bun.nanoseconds() - started) / REQUESTS;
}

const median = (values: number[]) =>
	[...values].sort((x, y) => x - y)[Math.floor(values.length / 2)] ?? 0;

const names = Object.keys(apps) as Name[];
const times = Object.fromEntries(names.map((name) => [name, [] as number[]]));
for (const name of names) await round(name);
for (let i = 0; i < ROUNDS; i++) {
	for (const name of names) times[name]?.push(await round(name));
}
const at = (name: Name) => median(times[name] ?? []);
const ns = (name: Name) => `${at(name).toFixed(0)} ns/request`;
console.log(`[hooks] list, 3 hooks:   ${ns('hooks')}`);
console.log(`middlewares, 3:          ${ns('middlewares')}`);
console.log(`use(), 3:                ${ns('scoped')}`);
console.log(`404:                     ${ns('missing')}`);
console.log(`404 through use(), 3:    ${ns('missingScoped')}`);
console.log(
	`ratio:                   ${(at('middlewares') / at('hooks')).toFixed(3)}`,
);
console.log(
	`ratio, use():            ${(at('scoped') / at('hooks')).toFixed(3)}`,
);
