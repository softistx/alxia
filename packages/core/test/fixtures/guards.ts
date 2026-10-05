/** Guards for the specs of what a 405 runs: each counts its runs. */
import { defineMiddleware } from '../../src/app/define-middleware';
import type { BaseContext } from '../../src/app/types';

/** A guard that counts its runs, and lets through a request carrying `header`. */
export const guardOn = (header: string, status: 401 | 403 = 401) => {
	const runs = { count: 0 };
	const guard = defineMiddleware(({ request, reply }, next) => {
		runs.count++;
		return request.headers.has(header)
			? next()
			: reply(status, { error: header });
	});
	return Object.assign(guard, { runs });
};

export const ok = ({ reply }: BaseContext) => reply(200, 'ok');
export const admin = { 'x-admin': '1' };
