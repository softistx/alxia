import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { setup } from '../test/app';
import { cache } from './cache';

describe('cache: invalidation and keys', () => {
	test('invalidated by path, and by tag', async () => {
		const { app, products, runs } = setup();
		await app.request('/products');
		await products.invalidate('/products');
		await app.request('/products');
		expect(runs()).toBe(2);
		await products.invalidateTag('products');
		await app.request('/products');
		expect(runs()).toBe(3);
	});

	test('invalidate(path) forgets every variant: each vary value, a key of your own', async () => {
		const varying = setup({ vary: ['accept-language'] });
		const ask = (language: string) =>
			varying.app.request('/hello', {
				headers: { 'accept-language': language },
			});
		await ask('fr');
		await ask('en');
		await varying.products.invalidate('/hello');
		expect((await ask('fr')).headers.get('x-cache')).toBe('MISS');
		expect((await ask('en')).headers.get('x-cache')).toBe('MISS');

		const keyed = setup({ key: (ctx) => `custom:${ctx.url.pathname}` });
		await keyed.app.request('/products?page=2');
		await keyed.products.invalidate('/products');
		expect(
			(await keyed.app.request('/products?page=2')).headers.get('x-cache'),
		).toBe('HIT'); // another path: `/products?page=2` is not `/products`
		await keyed.products.invalidate('/products?page=2');
		expect(
			(await keyed.app.request('/products?page=2')).headers.get('x-cache'),
		).toBe('MISS');
	});

	test('a key and tags that read what an earlier plugin added are typed with it', async () => {
		let runs = 0;
		const session = alxia().derive(({ request }) => ({
			user: { tenant: request.headers.get('x-tenant') ?? 'public' },
		}));
		const perTenant = cache<{ user: { tenant: string } }>({
			ttl: 60,
			key: ({ user, url }) => `${user.tenant}:${url.pathname}`,
			tags: ({ user }) => [`tenant:${user.tenant}`],
		});
		const app = alxia()
			.plugin(session)
			.use(perTenant)
			.get('/home', ({ user, reply }) =>
				reply(200, `${user.tenant} ${++runs}`),
			);
		const as = (tenant: string) =>
			app.request('/home', { headers: { 'x-tenant': tenant } });
		expect(await (await as('a')).text()).toBe('a 1');
		expect(await (await as('b')).text()).toBe('b 2');
		expect((await as('a')).headers.get('x-cache')).toBe('HIT');
		await perTenant.invalidateTag('tenant:a');
		expect(await (await as('a')).text()).toBe('a 3');
		expect((await as('b')).headers.get('x-cache')).toBe('HIT');

		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().use(perTenant);
			alxia()
				.derive(() => ({ user: { tenant: 1 } }))
				// @ts-expect-error the plugin reads "user", which this app's context gives with another type
				.use(perTenant);
		};
		expect(_refused).toBeFunction();
	});
});
