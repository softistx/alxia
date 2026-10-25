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
