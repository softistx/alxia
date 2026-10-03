import { describe, expect, test } from 'bun:test';
import { keepable } from './keep';

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
