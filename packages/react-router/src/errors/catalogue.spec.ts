import { describe, expect, test } from 'bun:test';
import { CODE, catalogueOn, fakeApi, TTL } from '../../test/errors/fake-api';
import { createErrorCatalogue } from './catalogue';
import { createApiMessages } from './messages';

describe('createErrorCatalogue', () => {
	test('needs at least one language', () => {
		expect(() =>
			createErrorCatalogue({
				messages: createApiMessages({ format: (message) => message }),
				languages: [],
				read: async () => ({ version: '1', messages: [] }),
				versions: async () => ({}),
				ttlMs: 1,
				clientCodes: [],
			}),
		).toThrow(
			new TypeError('createErrorCatalogue(): needs at least one language.'),
		);
	});
});

describe('fresh', () => {
	test('a cold language is awaited, read once', async () => {
		const { api, catalogue, said } = catalogueOn();
		expect(said()).toBeUndefined();
		await catalogue.fresh('en', 0);
		expect(said()).toBe('Taken.');
		expect(said('fr')).toBeUndefined();
		expect(api.calls).toEqual(['read en']);
		expect(catalogue.heldVersion('en')).toBe('v1');
		expect(catalogue.heldVersion('fr')).toBeUndefined();
	});

	test('a warm one is served as it is, with no call before the TTL', async () => {
		const { api, catalogue } = catalogueOn();
		await catalogue.fresh('en', 0);
		api.calls = [];
		await catalogue.fresh('en', TTL - 1);
		expect(api.calls).toEqual([]);
	});

	test('the TTL may be a getter, read on each check', async () => {
		let ttl = TTL;
		const { api, catalogue } = catalogueOn(fakeApi(), { ttlMs: () => ttl });
		await catalogue.fresh('en', 0);
		api.calls = [];
		await catalogue.fresh('en', 1_000);
		expect(api.calls).toEqual([]);
		ttl = 500;
		await catalogue.fresh('en', 1_000);
		await catalogue.settled();
		expect(api.calls).toEqual(['versions']);
	});

	test('freshAll reads every language', async () => {
		const { api, catalogue, said } = catalogueOn();
		await catalogue.freshAll(0);
		expect(said('en')).toBe('Taken.');
		expect(said('fr')).toBe('Pris.');
		expect(api.calls.sort()).toEqual(['read en', 'read fr']);
	});

	test('single flight: many requests start one first read', async () => {
		const { api, catalogue } = catalogueOn();
		await Promise.all([
			catalogue.fresh('en', 0),
			catalogue.fresh('en', 0),
			catalogue.fresh('en', 0),
		]);
		expect(api.calls).toEqual(['read en']);
	});

	test('a first read that fails keeps the API words, and is retried after retryMs', async () => {
		const api = fakeApi();
		api.down = true;
		const { catalogue, said, logged } = catalogueOn(api);
		await catalogue.fresh('en', 0);
		expect(said()).toBeUndefined();
		expect(logged).toEqual([
			'alxia-react-router: the error catalogue (en) was not read',
		]);
		// Too soon: no new call.
		await catalogue.fresh('en', 1_000);
		expect(api.calls).toEqual(['read en']);
		api.down = false;
		await catalogue.fresh('en', 6_000);
		expect(said()).toBe('Taken.');
		expect(api.calls).toEqual(['read en', 'read en']);
	});

	test('retryMs is an option', async () => {
		const api = fakeApi();
		api.down = true;
		const { catalogue } = catalogueOn(api, { retryMs: 100 });
		await catalogue.fresh('en', 0);
		await catalogue.fresh('en', 200);
		expect(api.calls).toEqual(['read en', 'read en']);
	});
});

describe('a slow API at a cold start', () => {
	const hold = () => {
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		return { gate, release };
	};
	test('a request waits a bounded time, the read goes on, and later words refusals', async () => {
		const api = fakeApi();
		const { gate, release } = hold();
		api.gate = gate;
		const { catalogue, said } = catalogueOn(api, { firstReadWaitMs: 20 });
		const started = performance.now();
		await catalogue.fresh('en', 0);
		expect(performance.now() - started).toBeLessThan(500);
		expect(said()).toBeUndefined();
		// A second request shares the read in flight.
		await catalogue.fresh('en', 10);
		expect(api.calls).toEqual(['read en']);
		release();
		await later(20);
		expect(said()).toBe('Taken.');
	});

	test('the wait is measured from when the read started, not per request', async () => {
		const api = fakeApi();
		const { gate, release } = hold();
		api.gate = gate;
		const { catalogue } = catalogueOn(api, { firstReadWaitMs: 60 });
		await catalogue.fresh('en', 0);
		const second = performance.now();
		await catalogue.fresh('en', 10);
		// Its wait was spent by the first request: this one returns at once.
		expect(performance.now() - second).toBeLessThan(50);
		release();
		await later(10);
	});

	test('a read that hangs, then fails, is not retried at once', async () => {
		const api = fakeApi();
		const { gate, release } = hold();
		api.gate = gate;
		api.down = true;
		const { catalogue, said } = catalogueOn(api, {
			firstReadWaitMs: 10,
			retryMs: 5_000,
		});
		await catalogue.fresh('en', 0);
		release();
		await later(30);
		// Within retryMs of the failure, not of the start.
		await catalogue.fresh('en', 5_005);
		expect(api.calls).toEqual(['read en']);
		expect(said()).toBeUndefined();
		await catalogue.fresh('en', 60_000);
		expect(api.calls).toEqual(['read en', 'read en']);
	});
});

describe('clientMessages', () => {
	test('holds the client codes only, in each language, and leaves out unknown codes', async () => {
		const { catalogue, messages } = catalogueOn();
		await catalogue.freshAll(0);
		const held = catalogue.clientMessages();
		expect(Object.keys(held.en)).toEqual(['validation.errors.required']);
		expect(Object.keys(held.fr)).toEqual(['validation.errors.required']);
		expect(held.en[CODE]).toBeUndefined();
		expect(messages.messageOf('en', CODE)).toBeDefined();
	});

	test('codes named like Object.prototype members are own entries, and the prototype stays clean', async () => {
		const api = fakeApi();
		const read = api.read;
		api.read = async (language) => {
			const reply = await read(language);
			return {
				...reply,
				messages: [
					...reply.messages,
					{ code: '__proto__', message: 'Proto.', params: [] },
					{ code: 'constructor', message: 'Ctor.', params: [] },
				],
			};
		};
		const { catalogue, messages } = catalogueOn(api, {
			clientCodes: ['__proto__', 'constructor'],
		});
		await catalogue.freshAll(0);
		const held = catalogue.clientMessages().en;
		expect(Object.keys(held).sort()).toEqual(['__proto__', 'constructor']);
		expect(Object.hasOwn(held, '__proto__')).toBe(true);
		expect(held['constructor']?.message).toBe('Ctor.');
		expect(Object.getOwnPropertyDescriptor(held, '__proto__')?.value).toEqual({
			message: 'Proto.',
			params: [],
		});
		expect(messages.messageOf('en', '__proto__')?.message).toBe('Proto.');
		expect(messages.messageOf('en', 'constructor')?.message).toBe('Ctor.');
		expect(Object.keys(Object.prototype)).toEqual([]);
		expect(({} as Record<string, unknown>)['message']).toBeUndefined();
		expect(Object.getPrototypeOf({})).toBe(Object.prototype);
	});

	test('a language not read yet has no messages', () => {
		const { catalogue } = catalogueOn();
		expect(catalogue.clientMessages()).toEqual({ en: {}, fr: {} });
	});
});

describe('warm and reset', () => {
	test('warm reads every language without being awaited', async () => {
		const { api, catalogue, said } = catalogueOn();
		catalogue.warm();
		await later(10);
		expect(said('fr')).toBe('Pris.');
		expect(api.calls.sort()).toEqual(['read en', 'read fr']);
	});

	test('reset forgets what is held and in the store', async () => {
		const { catalogue, said } = catalogueOn();
		await catalogue.freshAll(0);
		catalogue.reset();
		expect(said()).toBeUndefined();
		expect(catalogue.heldVersion('en')).toBeUndefined();
	});
});

const later = (ms: number) => new Promise((done) => setTimeout(done, ms));
