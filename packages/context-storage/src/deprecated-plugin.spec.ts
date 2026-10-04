import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { contextStorage, tryGetContext } from './storage';

const routed = () => tryGetContext()?.route ?? 'none';

describe('app.plugin(contextStorage()), deprecated', () => {
	test('a route declared after it reaches its context', async () => {
		const app = alxia()
			.plugin(contextStorage())
			.get('/late', ({ reply }) => reply(200, routed()));
		expect(await (await app.request('/late')).text()).toBe('/late');
	});

	test('a route declared before it reaches its context too, as 0.3 hooks did', async () => {
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, routed()))
			.plugin(contextStorage());
		expect(await (await app.request('/early')).text()).toBe('/early');
	});
});
