import { describe, expect, test } from 'bun:test';
import { isRouteErrorResponse } from 'react-router';
import { refusal } from '../../test/errors/refusal';
import { errorRequestId, routeError } from './route-error';

const apiError = (status?: number) =>
	refusal('todos.errors.forbidden', 'No', {
		http: status ? { status } : undefined,
	});

const withId = (error: ReturnType<typeof apiError>, requestId: string) =>
	Object.assign(error, { requestId });

describe('routeError', () => {
	test('an API error with 401, 403, 404 or 503 becomes a route error of that status', () => {
		for (const status of [401, 403, 404, 503]) {
			expect(routeError(apiError(status))).toMatchObject({
				init: { status },
				type: 'DataWithResponseInit',
			});
		}
	});

	test('other errors pass through unchanged', () => {
		const plain = apiError(500);
		expect(routeError(plain)).toBe(plain);
		const unstatused = apiError();
		expect(routeError(unstatused)).toBe(unstatused);
		const response = new Response(null, { status: 503 });
		expect(routeError(response)).toBe(response);
		expect(isRouteErrorResponse(routeError(response))).toBe(false);
		const boom = new Error('boom');
		expect(routeError(boom)).toBe(boom);
	});

	test('an API error with a request id carries it to the error page', () => {
		expect(routeError(withId(apiError(503), 'req-1'))).toMatchObject({
			data: { code: 'todos.errors.forbidden', requestId: 'req-1' },
			init: { status: 503 },
		});
	});

	test('an unrouted API error with a request id becomes a 500 that carries only the id', () => {
		const routed = routeError(withId(apiError(400), 'req-2'));
		expect(routed).toMatchObject({
			data: { requestId: 'req-2' },
			init: { status: 500 },
		});
		expect((routed as { data: object }).data).not.toHaveProperty('code');
	});

	test('a thrown Response carries its X-Request-Id to the error page; one without passes through', () => {
		const response = new Response('gone', {
			status: 503,
			headers: { 'x-request-id': 'req-3' },
		});
		expect(routeError(response)).toMatchObject({
			data: { requestId: 'req-3' },
			init: { status: 503 },
		});
		const bare = new Response(null, { status: 404 });
		expect(routeError(bare)).toBe(bare);
	});

	test('statuses and requestIdHeader replace the defaults', () => {
		const gone = apiError(410);
		expect(routeError(gone)).toBe(gone);
		expect(routeError(gone, { statuses: new Set([410]) })).toMatchObject({
			init: { status: 410 },
		});
		const missing = apiError(404);
		expect(routeError(missing, { statuses: new Set([410]) })).toBe(missing);
		const response = new Response(null, {
			status: 404,
			headers: { 'x-trace': 't-1' },
		});
		expect(routeError(response, { requestIdHeader: 'x-trace' })).toMatchObject({
			data: { requestId: 't-1' },
		});
	});
});

describe('errorRequestId', () => {
	test('reads the id of a route error, and nothing from anything else', () => {
		const routed = routeError(withId(apiError(503), 'req-4'));
		expect(errorRequestId(routed)).toBe('req-4');
		expect(errorRequestId(new Error('x'))).toBeUndefined();
		expect(errorRequestId({ data: 'text' })).toBeUndefined();
		expect(errorRequestId({ data: { requestId: '' } })).toBeUndefined();
		expect(errorRequestId(null)).toBeUndefined();
	});
});
