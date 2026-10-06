/**
 * The errors `@alxia/di` throws. Each extends `@nxgt/di`'s `DiError` and
 * carries a stable `code`: match on it, or on the class, never on the message.
 */

import { DiError } from '@nxgt/di';

/**
 * An `expose` middleware ran with no Scope on the context. The types refuse
 * an `expose` where no `di` middleware stands before it, so this is reached
 * through a cast, or a context whose `scope` something else replaced.
 */
export class ScopeNotMountedError extends DiError {
	override readonly name = 'ScopeNotMountedError';
	declare readonly token: undefined;
	readonly code = 'DI_SCOPE_NOT_MOUNTED';
	/** The keys the `expose` that threw was asked to set. */
	readonly keys: readonly string[];

	constructor(keys: readonly string[]) {
		super(
			undefined,
			`expose(${keys.map((k) => `'${k}'`).join(', ')}) ran on a request with no Scope: give its di() middleware to use() before it`,
		);
		this.keys = keys;
	}
}
