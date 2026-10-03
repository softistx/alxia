import { describe, expect, spyOn, test } from 'bun:test';
import { settled, watched } from './body';

describe('watched', () => {
	test('an end that throws still lets a cancel reach the source', async () => {
		const reported = spyOn(console, 'error').mockImplementation(() => {});
		try {
			let cancelled = false;
			const source = new ReadableStream<Uint8Array>({
				pull: (controller) => controller.enqueue(new Uint8Array([1])),
				cancel: () => {
					cancelled = true;
				},
			});
			const body = watched(source, () => {
				throw new Error('sink down');
			});
			const reader = body.getReader();
			await reader.read();
			await reader.cancel();
			expect(cancelled).toBe(true);
			expect(reported.mock.calls.map(([error]) => String(error))).toEqual([
				'Error: sink down',
			]);
		} finally {
			reported.mockRestore();
		}
	});

	test('ends once, however the body stops', async () => {
		const outcomes: string[] = [];
		const body = watched(new Response('hi').body as ReadableStream, (outcome) =>
			outcomes.push(outcome),
		);
		const reader = body.getReader();
		while (!(await reader.read()).done);
		await reader.cancel();
		expect(outcomes).toEqual(['completed']);
	});
});

test('settled: no body, or a Content-Length header; a raw Response has none', () => {
	expect(settled(new Response(null))).toBe(true);
	expect(
		settled(new Response('hi', { headers: { 'content-length': '2' } })),
	).toBe(true);
	expect(settled(new Response('hi'))).toBe(false);
});
