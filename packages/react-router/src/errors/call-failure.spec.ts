import { describe, expect, test } from 'bun:test';
import {
	type ApiError,
	ApiStatusError,
	ApiUnavailableError,
} from '@nxgt/graphql-client';
import { parse } from 'graphql';
import { refusal } from '../../test/errors/refusal';
import { apiCallFailure, operationName } from './call-failure';

function logger() {
	const lines: { level: 'warn' | 'error'; text: string }[] = [];
	return {
		lines,
		log: {
			warn: (text: unknown) =>
				lines.push({ level: 'warn', text: String(text) }),
			error: (text: unknown) =>
				lines.push({ level: 'error', text: String(text) }),
		},
	};
}

const api = 'my-api http://api.test/graphql';

describe('apiCallFailure', () => {
	test('an ApiError comes back as it is, with the request id, and a 4xx is a warning', () => {
		const { lines, log } = logger();
		const error = refusal('todos.errors.forbidden', 'No', {
			http: { status: 403 },
		});
		const failed = apiCallFailure(error, {
			api,
			operation: 'Todos',
			requestId: 'req-403',
			log,
		});
		expect(failed).toBe(error);
		expect((failed as ApiError & { requestId?: string }).requestId).toBe(
			'req-403',
		);
		expect(lines).toEqual([
			{
				level: 'warn',
				text: `${api}: Todos (request req-403) answered 403 todos.errors.forbidden`,
			},
		]);
	});

	test('a 5xx ApiError is an error line; without an id there is none on the error or in the line', () => {
		const { lines, log } = logger();
		const error = refusal(undefined, 'Down', { http: { status: 500 } });
		const failed = apiCallFailure(error, { api, log }) as ApiError & {
			requestId?: string;
		};
		expect(failed).toBe(error);
		expect(failed.requestId).toBeUndefined();
		expect(lines).toEqual([
			{ level: 'error', text: `${api}: operation answered 500` },
		]);
	});

	test('a 401, 403 or 404 without a GraphQL body keeps its status, reason and request id', async () => {
		const { lines, log } = logger();
		const status = new ApiStatusError(404, '<html>no</html>', {
			statusText: 'Nothing Here',
		});
		const failed = apiCallFailure(status, {
			api,
			requestId: 'req-404',
			log,
		}) as Response;
		expect(failed).toBeInstanceOf(Response);
		expect(failed.status).toBe(404);
		expect(failed.statusText).toBe('Nothing Here');
		expect(failed.headers.get('x-request-id')).toBe('req-404');
		expect(lines[0]).toMatchObject({ level: 'warn' });
		expect(lines[0]?.text).toContain('(request req-404) answered 404');
	});

	test('any other status without a GraphQL body is a logged 503', () => {
		const { lines, log } = logger();
		const failed = apiCallFailure(
			new ApiStatusError(502, '<html>bad gateway</html>'),
			{ api, requestId: 'req-502', log },
		) as Response;
		expect(failed.status).toBe(503);
		expect(failed.headers.get('x-request-id')).toBe('req-502');
		expect(lines).toHaveLength(1);
		expect(lines[0]?.level).toBe('error');
		expect(lines[0]?.text).toBe(
			`${api}: operation (request req-502) answered 502 without GraphQL`,
		);
	});

	test('a passedThrough status that cannot carry a body is answered with an empty one', async () => {
		const { log } = logger();
		const status = new ApiStatusError(204, '', { statusText: 'No Content' });
		const failed = apiCallFailure(status, {
			api,
			requestId: 'req-204',
			passedThrough: new Set([204]),
			log,
		}) as Response;
		expect(failed).toBeInstanceOf(Response);
		expect(failed.status).toBe(204);
		expect(failed.body).toBeNull();
		expect(failed.headers.get('x-request-id')).toBe('req-204');
	});

	test('passedThrough replaces the statuses that keep their own', () => {
		const { log } = logger();
		const status = new ApiStatusError(429, 'slow down');
		expect(
			(
				apiCallFailure(status, {
					api,
					log,
					passedThrough: new Set([429]),
				}) as Response
			).status,
		).toBe(429);
		expect(
			(
				apiCallFailure(new ApiStatusError(404, ''), {
					api,
					log,
					passedThrough: new Set([429]),
				}) as Response
			).status,
		).toBe(503);
	});

	test.each(['unreachable', 'timeout', 'invalid-response'] as const)(
		'an unavailable API (%s) is a 503 logged with its reason',
		async (reason) => {
			const { lines, log } = logger();
			const cause = new Error('boom');
			const failed = apiCallFailure(
				new ApiUnavailableError(reason, { cause }),
				{ api, operation: 'Todos', log },
			) as Response;
			expect(failed.status).toBe(503);
			expect(await failed.text()).toBe(reason);
			expect(failed.headers.get('x-request-id')).toBeNull();
			expect(lines).toEqual([
				{ level: 'error', text: `${api}: Todos ${reason}` },
			]);
		},
	);

	test('a closed tab is a 503; an error of an open one is returned as it is', () => {
		const { lines, log } = logger();
		const tab = new AbortController();
		const other = new Error('other');
		expect(apiCallFailure(other, { api, log, signal: tab.signal })).toBe(other);
		tab.abort();
		const failed = apiCallFailure(other, {
			api,
			log,
			signal: tab.signal,
		}) as Response;
		expect(failed.status).toBe(503);
		expect(lines).toEqual([
			{ level: 'error', text: `${api}: operation aborted` },
		]);
	});

	test('recognises the client by name, so a lookalike from another copy counts', () => {
		const { log } = logger();
		const lookalike = Object.assign(new Error('x'), {
			name: 'ApiStatusError',
			status: 403,
			statusText: 'Forbidden',
		});
		expect((apiCallFailure(lookalike, { api, log }) as Response).status).toBe(
			403,
		);
		const plain = Object.assign(new Error('x'), { status: 403 });
		expect(apiCallFailure(plain, { api, log })).toBe(plain);
	});

	test('logs to the console by default', () => {
		const warn = console.warn;
		const seen: string[] = [];
		console.warn = (text: unknown) => seen.push(String(text));
		try {
			apiCallFailure(new ApiStatusError(401, ''), { api });
		} finally {
			console.warn = warn;
		}
		expect(seen).toEqual([`${api}: operation answered 401`]);
	});
});

describe('operationName', () => {
	test('is the operation name, else its kind', () => {
		expect(operationName(parse('query Todos { todos }'))).toBe('Todos');
		expect(operationName(parse('{ todos }'))).toBe('query');
		expect(operationName(parse('mutation { done }'))).toBe('mutation');
	});

	test('skips fragments, and a document with no operation is `operation`', () => {
		expect(
			operationName(parse('fragment F on Todo { id } query Q { todos }')),
		).toBe('Q');
		expect(operationName(parse('fragment F on Todo { id }'))).toBe('operation');
	});
});
