/** The app most cache specs run: a cached `/products`, and routes whose responses are not kept. */
import { expectTypeOf } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache } from '../src/cache';

export function setup(options: Partial<Parameters<typeof cache>[0]> = {}) {
	let runs = 0;
	const products = cache({ ttl: 60, tags: () => ['products'], ...options });
	const app = alxia()
		.get('/live', ({ reply }) => reply(200, ++runs))
		.use(products)
		.get('/products', async ({ reply, cache: controls }) => {
			expectTypeOf(controls.tag).toBeFunction();
			await Bun.sleep(20);
			return reply(200, { runs: ++runs });
		})
		.get('/private', ({ reply }) =>
			reply(200, ++runs, { headers: { 'cache-control': 'private' } }),
		)
		.get('/skipped', ({ reply, cache: controls }) => {
			controls.skip();
			return reply(200, ++runs);
		})
		.get('/missing', ({ reply }) => reply(404, ++runs))
		.get('/hello', ({ request, reply }) =>
			reply(200, `${request.headers.get('accept-language') ?? '-'} ${++runs}`),
		);
	return { app, products, runs: () => runs };
}
