import { describe, expect, test } from 'bun:test';
import { keepable, shareable } from './keep';

describe('keepable', () => {
	const statuses = new Set([200]);
	const keeps = (init: ResponseInit, skipped = false) =>
		keepable(new Response('x', init), { tags: [], skipped }, statuses);

	test('a plain 200 is kept', () => {
		expect(keeps({})).toBe(true);
	});

	test("skipped, another status, someone's own, or a stream is not", () => {
		expect(keeps({}, true)).toBe(false);
		expect(keeps({ status: 404 })).toBe(false);
		expect(keeps({ headers: { 'cache-control': 'private' } })).toBe(false);
		expect(keeps({ headers: { 'cache-control': 'no-store' } })).toBe(false);
		expect(keeps({ headers: { 'set-cookie': 'a=1' } })).toBe(false);
		expect(keeps({ headers: { 'content-type': 'text/event-stream' } })).toBe(
			false,
		);
	});
});

describe('shareable', () => {
	const none = { authorization: false, cookie: false };
	const shares = (
		headers: Record<string, string>,
		cacheControl = '',
		keyedBy = none,
	) =>
		shareable(
			new Request('http://x/', { headers }),
			new Response('x', { headers: { 'cache-control': cacheControl } }),
			keyedBy,
		);

	test('a request with no credential: its answer is shared', () => {
		expect(shares({})).toBe(true);
	});

	test("Authorization or Cookie: someone's own, unless the response or the key says otherwise", () => {
		expect(shares({ authorization: 'Bearer a' })).toBe(false);
		expect(shares({ cookie: 'session=a' })).toBe(false);
		for (const directive of [
			'public',
			'max-age=0, s-maxage=60',
			'must-revalidate',
		]) {
			expect(shares({ authorization: 'Bearer a' }, directive)).toBe(true);
			expect(shares({ cookie: 'session=a' }, directive)).toBe(true);
		}
		expect(
			shares({ authorization: 'Bearer a' }, '', {
				...none,
				authorization: true,
			}),
		).toBe(true);
		expect(shares({ cookie: 'session=a' }, '', { ...none, cookie: true })).toBe(
			true,
		);
		expect(
			shares({ authorization: 'Bearer a', cookie: 'session=a' }, '', {
				...none,
				cookie: true,
			}),
		).toBe(false);
	});
});
