import { describe, expect, expectTypeOf, test } from 'bun:test';
import { problem } from './problem';
import type { Reply } from './reply';
import { toResponse } from './reply';

describe('problem', () => {
	test('replies with its status, as application/problem+json', async () => {
		const reply = problem({
			type: 'urn:ietf:params:jmap:error:limit',
			status: 413,
			limit: 'maxSizeRequest',
		});
		expect(reply.status).toBe(413);
		const response = toResponse(
			reply.status,
			reply.body,
			new Headers(reply.headers),
		);
		expect(response.headers.get('content-type')).toBe(
			'application/problem+json',
		);
		expect(await response.json()).toEqual({
			type: 'urn:ietf:params:jmap:error:limit',
			status: 413,
			limit: 'maxSizeRequest',
		});
	});

	test('extension members are kept in the type', () => {
		const reply = problem({
			type: 'urn:ietf:params:jmap:error:limit',
			status: 413,
			limit: 'maxSizeRequest',
		});
		expectTypeOf(reply).toEqualTypeOf<
			Reply<
				413,
				{
					readonly type: 'urn:ietf:params:jmap:error:limit';
					readonly status: 413;
					readonly limit: 'maxSizeRequest';
				}
			>
		>();
	});

	test('a content-type of its own, and other headers, are kept', () => {
		const reply = problem(
			{ status: 400 },
			{ headers: { 'content-type': 'application/json', 'x-a': '1' } },
		);
		const headers = new Headers(reply.headers);
		expect(headers.get('content-type')).toBe('application/json');
		expect(headers.get('x-a')).toBe('1');
	});

	test('mistakes are compile errors', () => {
		// Never called: only compiled.
		const _mistakes = () => {
			// @ts-expect-error: a problem has a status
			problem({ type: 'urn:x' });
			// @ts-expect-error: an error status, never a 200
			problem({ status: 200 });
			// @ts-expect-error: `detail` is a string
			problem({ status: 400, detail: 1 });
		};
		expect(_mistakes).toBeFunction();
	});
});
