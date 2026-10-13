import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createI18n } from './i18n';

const en = { hello: 'Hello', only: { en: 'Only English' }, ping: 'Ping' };
const fr = { hello: 'Bonjour', only: { fr: 'Seulement français' } };
const pt = { hello: 'Olá', rare: 'Raro' };
const ptBR = { hello: 'Oi' };
const resources = { en, fr, pt, 'pt-BR': ptBR };

type Key = 'hello' | 'rare' | 'ping' | 'only.fr' | 'nowhere';

const make = () =>
	createI18n<Key, 'en' | 'fr' | 'pt' | 'pt-BR'>({
		resources,
		fallback: 'fr',
		fallbacks: (language) => (language === 'pt-BR' ? ['pt'] : []),
	});

describe('the chain', () => {
	test('is the language, the request steps, fallbacks(language), then the fallback, each once', async () => {
		const i18n = make();
		const app = alxia()
			.use(i18n)
			.get('/', ({ reply }) => {
				i18n.fallBackTo('en');
				i18n.fallBackTo('pt-BR');
				i18n.fallBackTo('fr');
				return reply(200, i18n.chain());
			});
		expect(await (await app.request('/?lang=pt-BR')).json()).toEqual([
			'pt-BR',
			'en',
			'fr',
			'pt',
		]);
		expect(await (await app.request('/?lang=en')).json()).toEqual([
			'en',
			'pt-BR',
			'fr',
		]);
	});

	test('outside a request it is the fallback, and fallBackTo does nothing', () => {
		const i18n = make();
		i18n.fallBackTo('en');
		expect(i18n.chain()).toEqual(['fr']);
		expect(i18n.t('hello')).toBe('Bonjour');
	});

	test('t tries each language in order, and answers the key only when all miss', async () => {
		const i18n = make();
		const app = alxia()
			.use(i18n)
			.get('/', ({ t, reply }) => {
				i18n.fallBackTo('en');
				return reply(200, [
					t('hello'),
					t('rare'), // pt-BR misses; en and fr too; pt (fallbacks) has it
					t('ping'), // only en has it, a step before fr
					t('only.fr'), // fr, the fallback
					t('nowhere'),
				]);
			});
		expect(await (await app.request('/?lang=pt-BR')).json()).toEqual([
			'Oi',
			'Raro',
			'Ping',
			'Seulement français',
			'nowhere',
		]);
	});

	test('a per-request step stays with its request', async () => {
		const i18n = make();
		const app = alxia()
			.use(i18n)
			.get('/:school', async ({ params, t, reply }) => {
				i18n.fallBackTo(params.school);
				await Bun.sleep(params.school === 'en' ? 15 : 1);
				return reply(200, { chain: i18n.chain(), ping: t('ping') });
			});
		const [a, b, c] = await Promise.all(
			['en', 'pt', 'en'].map(async (school) =>
				(await app.request(`/${school}?lang=fr`)).json(),
			),
		);
		expect(a).toEqual({ chain: ['fr', 'en'], ping: 'Ping' });
		expect(b).toEqual({ chain: ['fr', 'pt'], ping: 'ping' });
		expect(c).toEqual(a);
		expect(i18n.chain()).toEqual(['fr']);
	});
});

describe('without fallbacks or fallBackTo', () => {
	test('a key the request language lacks answers itself, as before', async () => {
		const i18n = createI18n<Key>({ resources, fallback: 'fr' });
		const app = alxia()
			.use(i18n)
			.get('/', ({ t, reply }) => reply(200, t('ping')));
		expect(await (await app.request('/?lang=en')).text()).toBe('Ping');
		expect(await (await app.request('/?lang=pt')).text()).toBe('ping');
		expect(i18n.t('ping')).toBe('ping');
		expect(i18n.chain()).toEqual(['fr']);
	});

	test('the chain of a request is its language, then the fallback', async () => {
		const i18n = createI18n<Key>({ resources, fallback: 'fr' });
		const app = alxia()
			.use(i18n)
			.get('/', ({ reply }) => reply(200, i18n.chain()));
		expect(await (await app.request('/?lang=en')).json()).toEqual(['en', 'fr']);
	});
});

describe('edge cases', () => {
	test('flat keys are found as the translator finds them', async () => {
		const i18n = createI18n<'home.title'>({
			resources: {
				en: { home: { title: 'Home' } },
				fr: { 'home.title': 'Accueil' },
			},
			fallback: 'en',
			fallbacks: () => ['en'],
		});
		const app = alxia()
			.use(i18n)
			.get('/', ({ t, reply }) => reply(200, t('home.title')));
		expect(await (await app.request('/?lang=fr')).text()).toBe('Accueil');
	});

	test('i18n.t follows the chain inside a request, and a step with no catalogue misses', async () => {
		const i18n = make();
		const app = alxia()
			.use(i18n)
			.get('/', async ({ reply }) => {
				i18n.fallBackTo('xx');
				await Bun.sleep(1);
				return reply(200, [i18n.t('ping'), i18n.chain()]);
			});
		expect(await (await app.request('/?lang=pt')).json()).toEqual([
			'ping',
			['pt', 'xx', 'fr'],
		]);
	});

	test('fallbacks(fallback) joins the chain outside a request', () => {
		const i18n = createI18n<Key>({
			resources,
			fallback: 'fr',
			fallbacks: () => ['en', 'fr'],
		});
		expect(i18n.chain()).toEqual(['fr', 'en']);
		expect(i18n.t('ping')).toBe('Ping');
	});
});
