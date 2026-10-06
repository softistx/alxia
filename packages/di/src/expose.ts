import type { BaseContext, NextFunction } from '@alxia/core';
import type { AnyToken } from '@nxgt/di';
import { ScopeNotMountedError } from './errors';
import type { RuntimeScope } from './lazy-scope';

/**
 * The middleware behind `deps.expose(tokens)`: resolves every Token in the
 * context's Scope, all at once, and passes each value on under its key.
 */
export function exposeFrom(tokens: Readonly<Record<string, AnyToken>>) {
	const entries = Object.entries(tokens);
	return async function expose(
		ctx: BaseContext & { readonly scope?: RuntimeScope },
		next: NextFunction,
	) {
		const { scope } = ctx;
		if (typeof scope?.resolve !== 'function') {
			throw new ScopeNotMountedError(Object.keys(tokens));
		}
		const values = await Promise.all(
			entries.map(([, token]) => scope.resolve(token)),
		);
		return next(
			Object.fromEntries(entries.map(([key], i) => [key, values[i]])),
		);
	};
}
