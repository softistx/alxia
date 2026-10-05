/**
 * What sharing a base costs: building an app of 50 routes on it, forking
 * that app (`fork()` re-declares its routes on a copy), and the request
 * it then serves, which a fork must not slow. Run from the package:
 * `bun test/bench/base.ts`. Prints the median of each.
 */
import { alxia } from '@alxia/core';

const ROUNDS = 7;
const BUILDS = 500;
const REQUESTS = 50_000;

const fresh = () =>
	alxia()
		.decorate({ db: 'db' })
		.derive(() => ({ user: 'ada' }));
const base = fresh();

function build(on: typeof base) {
	let app = on;
	for (let index = 0; index < 50; index++) {
		app = app.get(`/r${index}/:id`, ({ params, reply }) =>
			reply(200, params.id),
		);
	}
	return app;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] as number;
}

function time(run: () => void, times: number): number {
	const start = Bun.nanoseconds();
	for (let index = 0; index < times; index++) run();
	return (Bun.nanoseconds() - start) / times;
}

const built: number[] = [];
const forked: number[] = [];
for (let round = 0; round < ROUNDS; round++) {
	built.push(time(() => build(fresh()), BUILDS));
	const full = build(base.fork());
	forked.push(time(() => full.fork(), BUILDS));
}

const app = build(base.fork());
const request = new Request('http://localhost/r25/7');
const served: number[] = [];
for (let round = 0; round < ROUNDS; round++) {
	const start = Bun.nanoseconds();
	for (let index = 0; index < REQUESTS; index++) await app.fetch(request);
	served.push((Bun.nanoseconds() - start) / REQUESTS);
}

const us = (ns: number) => `${(ns / 1000).toFixed(1)} µs`;
console.log(`build 50 routes: ${us(median(built))}`);
console.log(`fork of 50 routes: ${us(median(forked))}`);
console.log(`fetch: ${Math.round(median(served))} ns`);
