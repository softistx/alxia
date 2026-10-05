/**
 * A refusal of `session()` or `permission()`, in the format of the app
 * that serves the request: its `{ error }` body by default, an RFC 9457
 * problem under `alxia({ errors: 'problem' })`.
 */
import {
	type BaseContext,
	errorFormat,
	type Problem,
	problem,
	problemOf,
	type Reply,
} from '@alxia/core';

/** `body` with `status`, or the problem of `status` saying `detail`. */
export function refused<Status extends 401 | 403 | 404, Body>(
	ctx: BaseContext,
	status: Status,
	body: Body,
	detail: string,
): Reply<Status, Body | Problem<Status>> {
	if (errorFormat(ctx) === 'problem') {
		return problem(problemOf(ctx, { status, detail }));
	}
	return ctx.reply(status, body);
}
