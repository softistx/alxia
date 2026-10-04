import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createI18n } from './i18n';

const en = { home: { title: 'Home' } } as const;
const fr = { home: { title: 'Accueil' } } as const;
const i18nOf = () => createI18n({ resources: { en, fr }, fallback: 'en' });

describe('app.plugin(createI18n()), deprecated', () => {
	test('a route declared after it reads t', async () => {
		const app = alxia()
			.plugin(i18nOf())
			.get('/late', ({ t, reply }) => reply(200, t('home.title')));
		const response = await app.request('/late?lang=fr');
		expect(await response.text()).toBe('Accueil');
	});

	test('a route declared before it speaks the request language too, as 0.3 hooks did', async () => {
		const i18n = i18nOf();
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, i18n.t('home.title')))
			.plugin(i18n);
		const response = await app.request('/early?lang=fr');
		expect(await response.text()).toBe('Accueil');
		expect(response.headers.get('content-language')).toBe('fr');
	});
});
