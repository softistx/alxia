/**
 * The chain's cost: a route behind 3 middlewares made by
 * `defineMiddleware`, the same 3 written inline as plain `(ctx, next)`
 * functions, the same 3 given to `use`, and a route behind 3 `derive`s,
 * the cheapest step, which the ratios are taken against; and a 404, on an
 * app with none and on one with the 3 given to `use`, which a request no
 * route matches runs. Run from the package: `bun test/bench/chain.ts`.
 * Prints the median time of a request in each form and the ratios; a
 * middleware form should stay within 15% of the `derive`s.
 *
 * #131 cost the middleware form 12% (1180 → 1330 ns on one machine): the
 * handler each `next()` attached so that an error nobody reads is never
 * an unhandled rejection. It is attached now only when the middleware
 * does not return `next()`'s promise, which the chain then passes on
 * without another `then`, and the steps that never wait run in one loop.
 * `next.behind` is one function shared by every call: an `Object.assign`
 * of it onto each `next` cost the middleware form 15% again. Before 0.5,
 * measured against a route's list of hooks of 0.3: the list 990 ns, the
 * middlewares 1075 ns (1.085), `use()` 1102 ns (1.113), a 404 465 ns bare
 * and 1258 ns through three `use()`.
 */
import { alxia, defineMiddleware } from '@alxia/core';

const ROUNDS = 7;
const REQUESTS = 50_000;

const ma = defineMiddleware((_ctx, next) => next({ a: 1 }));
const mb = defineMiddleware<{ a: number }>()(({ a }, next) =>
	next({ b: a + 1 }),
);
const mc = defineMiddleware<{ b: number }>()(({ b }, next) =>
	next({ c: b + 1 }),
);

const apps = {
	derived: alxia()
		.derive(() => ({ a: 1 }))
		.derive(({ a }) => ({ b: a + 1 }))
		.derive(({ b }) => ({ c: b + 1 }))
		.get('/', ({ c, reply }) => reply(200, c)),
	middlewares: alxia().get('/', ma, mb, mc, ({ c, reply }) => reply(200, c)),
	plain: alxia().get(
		'/',
		(_ctx, next) => next({ a: 1 }),
		({ a }, next) => next({ b: a + 1 }),
		({ b }, next) => next({ c: b + 1 }),
		({ c, reply }) => reply(200, c),
	),
	scoped: alxia()
		.use(ma, mb, mc)
		.get('/', ({ c, reply }) => reply(200, c)),
	missing: alxia().get('/', ({ reply }) => reply(200, 'ok')),
	missingScoped: alxia()
		.use(ma, mb, mc)
		.get('/', ({ reply }) => reply(200, 'ok')),
};
const requests = {
	derived: new Request('http://localhost/'),
	middlewares: new Request('http://localhost/'),
	plain: new Request('http://localhost/'),
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
console.log(`derive, 3:                ${ns('derived')}`);
console.log(`middlewares, 3:          ${ns('middlewares')}`);
console.log(`plain functions, 3:      ${ns('plain')}`);
console.log(`use(), 3:                ${ns('scoped')}`);
console.log(`404:                     ${ns('missing')}`);
console.log(`404 through use(), 3:    ${ns('missingScoped')}`);
const ratio = (name: Name) => (at(name) / at('derived')).toFixed(3);
console.log(`ratio:                   ${ratio('middlewares')}`);
console.log(`ratio, plain:            ${ratio('plain')}`);
console.log(`ratio, use():            ${ratio('scoped')}`);
