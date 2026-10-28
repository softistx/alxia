import { describe, expect, test } from 'bun:test';
import { FAILED, isFailedPage, orFailed } from './or-failed';

const boom = new Error('boom');

describe('orFailed', () => {
	test('returns the answer, with or without a cursor', async () => {
		expect(await orFailed(null, async () => 1)).toBe(1);
		expect(await orFailed('c', async () => 2)).toBe(2);
		expect(await orFailed(undefined, () => 3)).toBe(3);
	});

	test('rethrows without a cursor', async () => {
		await expect(
			orFailed(null, async () => {
				throw boom;
			}),
		).rejects.toBe(boom);
		await expect(
			orFailed('', () => {
				throw boom;
			}),
		).rejects.toBe(boom);
	});

	test('answers FAILED on any error with a cursor', async () => {
		expect(
			await orFailed('c', async () => {
				throw boom;
			}),
		).toBe(FAILED);
		expect(
			await orFailed('c', () => {
				throw boom;
			}),
		).toBe(FAILED);
		expect(
			await orFailed('c', async () => {
				throw new Response(null, { status: 503 });
			}),
		).toBe(FAILED);
		expect(
			await orFailed('c', async () => {
				throw 'text';
			}),
		).toBe(FAILED);
	});

	test('rethrows a 3xx Response with a cursor', async () => {
		const redirect = new Response(null, {
			status: 302,
			headers: { Location: '/sign-in' },
		});
		await expect(
			orFailed('c', async () => {
				throw redirect;
			}),
		).rejects.toBe(redirect);
	});

	test('a 4xx Response is FAILED, not rethrown', async () => {
		expect(
			await orFailed('c', async () => {
				throw new Response(null, { status: 404 });
			}),
		).toBe(FAILED);
	});
});

describe('isFailedPage', () => {
	test('recognises FAILED and nothing else', () => {
		expect(FAILED).toEqual({ failed: true });
		expect(isFailedPage(FAILED)).toBe(true);
		expect(isFailedPage({ failed: true })).toBe(true);
		expect(isFailedPage({ failed: false })).toBe(false);
		expect(isFailedPage({ rows: [], next: null })).toBe(false);
		expect(isFailedPage(null)).toBe(false);
		expect(isFailedPage('failed')).toBe(false);
	});
});
