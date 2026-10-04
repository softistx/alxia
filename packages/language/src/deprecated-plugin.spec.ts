import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { language } from './language';

describe('app.plugin(language()), deprecated', () => {
	test('a route declared after it reads language', async () => {
		const app = alxia()
			.plugin(language({ supported: ['en', 'fr'], fallback: 'en' }))
			.get('/late', ({ language: lang, reply }) => {
				expectTypeOf(lang).toEqualTypeOf<'en' | 'fr'>();
				return reply(200, lang);
			});
		const response = await app.request('/late?lang=fr');
		expect(await response.text()).toBe('fr');
		expect(response.headers.get('content-language')).toBe('fr');
	});

	test('a route declared before it gets Content-Language too, as 0.3 hooks did', async () => {
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, 'early'))
			.plugin(language({ supported: ['en', 'fr'], fallback: 'en' }));
		const response = await app.request('/early?lang=fr');
		expect(response.headers.get('content-language')).toBe('fr');
	});
});
