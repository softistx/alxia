import { describe, expect, test } from 'bun:test';
import { withHeaders } from './headers';

/** A response whose headers refuse every edit, as a `fetch` one may. */
function frozen(body: string): Response {
	const headers = new Headers({ 'content-type': 'text/plain' });
	const refuse = () => {
		throw new TypeError('Headers are immutable');
	};
	return Object.defineProperty(new Response(body), 'headers', {
		value: Object.assign(headers, {
			set: refuse,
			append: refuse,
			delete: refuse,
		}),
	});
}

describe('withHeaders', () => {
	test('edits mutable headers in place', () => {
		const response = new Response('x');
		const edited = withHeaders(response, (headers) => headers.set('x-a', '1'));
		expect(edited).toBe(response);
		expect(edited.headers.get('x-a')).toBe('1');
	});

	test('an edit that throws: the same error, the body unread', async () => {
		const response = new Response('body');
		const failure = new Error('edit failed');
		expect(() =>
			withHeaders(response, () => {
				throw failure;
			}),
		).toThrow(failure);
		expect(response.bodyUsed).toBe(false);
		expect(await response.text()).toBe('body');
	});

	test('immutable headers: a copy, edited, with the body and the status', async () => {
		const response = frozen('body');
		const edited = withHeaders(response, (headers) => headers.set('x-a', '1'));
		expect(edited).not.toBe(response);
		expect(edited.headers.get('x-a')).toBe('1');
		expect(edited.headers.get('content-type')).toBe('text/plain');
		expect(edited.status).toBe(200);
		expect(await edited.text()).toBe('body');
	});

	test('immutable headers and an edit that throws: the original still readable', async () => {
		const response = frozen('body');
		expect(() =>
			withHeaders(response, (headers) => {
				headers.set('x-a', '1');
				throw new Error('edit failed');
			}),
		).toThrow('edit failed');
		expect(response.bodyUsed).toBe(false);
		expect(await response.text()).toBe('body');
	});
});
