import { describe, expect, test } from 'bun:test';
import { catalogueOn, fakeApi, TTL } from '../../test/errors/fake-api';

async function warm(options?: Parameters<typeof catalogueOn>[1]) {
	const on = catalogueOn(fakeApi(), options);
	await on.catalogue.freshAll(0);
	on.api.calls = [];
	return on;
}

describe('the background check', () => {
	test('past the TTL it checks the versions, not awaiting a re-read', async () => {
		const { api, catalogue } = await warm();
		await catalogue.fresh('en', TTL);
		await catalogue.settled();
		expect(api.calls).toEqual(['versions']);
		expect(catalogue.heldVersion('en')).toBe('v1');
		// Confirmed at TTL: not asked again before another TTL.
		await catalogue.fresh('en', TTL + 1);
		await catalogue.fresh('fr', TTL + 1);
		expect(api.calls).toEqual(['versions']);
		await catalogue.fresh('en', 2 * TTL);
		await catalogue.settled();
		expect(api.calls).toEqual(['versions', 'versions']);
	});

	test('one check at a time, whatever the number of requests', async () => {
		const { api, catalogue } = await warm();
		await Promise.all([
			catalogue.fresh('en', TTL),
			catalogue.fresh('fr', TTL),
			catalogue.freshAll(TTL),
		]);
		await catalogue.settled();
		expect(api.calls).toEqual(['versions']);
	});

	test('a version that moved is read again, in the background, for that language only', async () => {
		const { api, catalogue, said } = await warm();
		api.say('en', 'No, sorry.');
		await catalogue.fresh('en', TTL);
		// Still the old words while it asks.
		expect(said()).toBe('Taken.');
		await catalogue.settled();
		expect(said()).toBe('No, sorry.');
		expect(catalogue.heldVersion('en')).toBe('v1+');
		expect(said('fr')).toBe('Pris.');
		expect(api.calls).toEqual(['versions', 'read en']);
	});

	test('a language missing from the versions is read again', async () => {
		const { api, catalogue } = await warm();
		api.versions = async () => {
			api.calls.push('versions');
			return { en: 'v1' };
		};
		await catalogue.fresh('en', TTL);
		await catalogue.settled();
		expect(api.calls).toEqual(['versions', 'read fr']);
	});

	test('an API that is down keeps the messages held, and is asked again after retryMs', async () => {
		const { api, catalogue, said, logged } = await warm();
		api.down = true;
		await catalogue.fresh('en', TTL);
		await catalogue.settled();
		expect(api.calls).toEqual(['versions']);
		expect(said()).toBe('Taken.');
		expect(logged).toEqual([
			'alxia-react-router: the error catalogue was not checked, keeping what is held',
		]);
		await catalogue.fresh('en', TTL + 1_000);
		await catalogue.settled();
		expect(api.calls).toHaveLength(1);
		await catalogue.fresh('en', TTL + 5_000);
		await catalogue.settled();
		expect(api.calls).toHaveLength(2);
	});

	test('the retry delay follows a TTL getter', async () => {
		const { api, catalogue } = await warm({ ttlMs: () => 1_000, retryMs: 50 });
		api.down = true;
		await catalogue.fresh('en', 1_000);
		await catalogue.settled();
		await catalogue.fresh('en', 1_049);
		await catalogue.settled();
		expect(api.calls).toHaveLength(1);
		await catalogue.fresh('en', 1_050);
		await catalogue.settled();
		expect(api.calls).toHaveLength(2);
	});
});

describe('a user callback that throws', () => {
	async function unhandledDuring(run: () => Promise<void>) {
		const seen: unknown[] = [];
		const on = (reason: unknown) => void seen.push(reason);
		process.on('unhandledRejection', on);
		try {
			await run();
			await new Promise((done) => setTimeout(done, 20));
		} finally {
			process.off('unhandledRejection', on);
		}
		return seen;
	}

	test('a log.error that throws leaves no unhandled rejection, and the catalogue keeps working', async () => {
		const { api, catalogue, said } = await warm({
			log: {
				error: () => {
					throw new Error('log broke');
				},
			},
		});
		const seen = await unhandledDuring(async () => {
			api.down = true;
			await catalogue.fresh('en', TTL);
			await catalogue.settled();
			// A first read that fails goes through the same log.
			await catalogue.fresh('fr', TTL);
		});
		expect(seen).toEqual([]);
		api.down = false;
		await catalogue.fresh('en', TTL + 5_000);
		await catalogue.settled();
		expect(said()).toBe('Taken.');
		expect(api.calls.filter((call) => call === 'versions')).toHaveLength(2);
	});

	test('a ttlMs getter that throws leaves no unhandled rejection, and the catalogue keeps working', async () => {
		let broken = false;
		const { api, catalogue, said, logged } = await warm({
			retryMs: 50,
			ttlMs: () => {
				if (broken) throw new Error('ttl broke');
				return TTL;
			},
		});
		broken = true;
		api.down = true;
		const seen = await unhandledDuring(async () => {
			await catalogue.fresh('en', TTL);
			await catalogue.settled();
		});
		expect(seen).toEqual([]);
		expect(logged).toContain('alxia-react-router: ttlMs threw, using retryMs');
		expect(said()).toBe('Taken.');
		broken = false;
		api.down = false;
		await catalogue.fresh('en', 2 * TTL);
		await catalogue.settled();
		expect(
			api.calls.filter((call) => call === 'versions').length,
		).toBeGreaterThan(1);
	});
});
