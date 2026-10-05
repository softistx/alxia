/**
 * The one 500 alxia answers an error with, in the serving app's format:
 * `{ error: 'internal' }`, or a problem whose detail says the server
 * failed — the error's `stack` added in dev alone (`dev/failure.ts`).
 */
import { PROBLEM, problemOf } from '../errors/problems';
import { toResponse } from '../reply/reply';
import { errorFormat } from './served';

/** A 500 in the format of the app that serves `ctx`, `extra` in its body. */
export function internalError(
	ctx: { readonly request: Request; readonly url?: URL },
	extra: { readonly stack?: string } = {},
): Response {
	if (errorFormat(ctx) === 'json') {
		return toResponse(500, { error: 'internal', ...extra }, new Headers());
	}
	const url = ctx.url ?? new URL(ctx.request.url);
	const body = problemOf(
		{ url },
		{
			status: 500,
			detail: 'The server failed to answer the request',
			...extra,
		},
	);
	return toResponse(500, body, new Headers({ 'content-type': PROBLEM }));
}
