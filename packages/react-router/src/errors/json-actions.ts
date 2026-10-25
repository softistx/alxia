import { data, redirect } from 'react-router';
import { nextOf } from './page-path';
import type { InferOutput, StandardSchemaV1 } from './standard-schema';

export interface JsonActionsOptions {
	/**
	 * The origin a request must come from, such as `https://app.example.com`:
	 * required behind a TLS-terminating proxy, where the request's own URL
	 * says `http:`. A getter is read at each request. Else the request's own
	 * origin.
	 */
	origin?: string | (() => string | undefined);
}

/** The actions' JSON helpers, bound to one app's origin. */
export interface JsonActions {
	/**
	 * The JSON body an action was posted, refused unless it comes from this
	 * site: 403 for another origin or a cross-site fetch, 415 for a body that
	 * is not `application/json`, 400 for malformed JSON.
	 */
	readJson(request: Request): Promise<unknown>;
	/**
	 * For the actions a form posts to: a native post (before hydration) goes
	 * back to its page, which then posts JSON. A JSON post goes on.
	 */
	requireJsonPost(request: Request): void;
	/**
	 * The `input` of the JSON body `{ input }`, checked against a Standard
	 * Schema (Zod 4, Valibot, ArkType), whose validation may be async. A
	 * refused input is a 400.
	 */
	readInput<S extends StandardSchemaV1>(
		request: Request,
		schema: S,
	): Promise<InferOutput<S>>;
}

/**
 * Every action takes JSON: a cross-site page can only post a form or
 * `text/plain` without a preflight, so requiring `application/json` and a
 * same-origin `Origin` (or `Sec-Fetch-Site`) stops CSRF before the session
 * cookie's `SameSite` is even consulted.
 */
export function jsonActions(options: JsonActionsOptions = {}): JsonActions {
	const ownOrigin = (request: Request) => {
		const { origin } = options;
		const set = typeof origin === 'function' ? origin() : origin;
		return set ?? new URL(request.url).origin;
	};
	const isJson = (request: Request) =>
		request.headers.get('content-type')?.startsWith('application/json');

	async function readJson(request: Request): Promise<unknown> {
		const origin = request.headers.get('origin');
		const site = request.headers.get('sec-fetch-site');
		if (
			(origin && origin !== ownOrigin(request)) ||
			(site && site !== 'same-origin' && site !== 'none')
		) {
			throw data('Cross-site request refused', { status: 403 });
		}
		if (!isJson(request)) {
			throw data('Expected a JSON body', { status: 415 });
		}
		return request.json().catch(() => {
			throw data('Malformed JSON body', { status: 400 });
		});
	}

	return {
		readJson,
		requireJsonPost(request) {
			if (!isJson(request)) throw redirect(nextOf(request.url));
		},
		async readInput(request, schema) {
			const body = (await readJson(request)) as { input?: unknown } | null;
			const result = await schema['~standard'].validate(body?.input);
			if (result.issues) {
				throw data('The form sent an input the API would refuse', {
					status: 400,
				});
			}
			return result.value as InferOutput<typeof schema>;
		},
	};
}
