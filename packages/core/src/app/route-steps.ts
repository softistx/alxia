/**
 * How the arguments of a route method, after its path, become its chain:
 * its options, its middlewares and what ends it — the handler, or a
 * socket's handlers.
 */
import type { ChainHook } from './definition';
import type { RouteSchema } from './types';
import { builtinOf } from './validate';

/** The arguments after the path, read. */
export interface RouteArgs<Last> {
	/** Its options: its `bodyLimit` and `detail`, a socket's `message` and `send`. */
	readonly config: Readonly<Record<string, unknown>>;
	readonly middlewares: readonly unknown[];
	readonly last: Last;
}

/** What `validate(…)` and `responds(…)` take, never a route's options. */
const SCHEMAS = ['params', 'query', 'headers', 'cookies', 'body', 'response'];

/**
 * Reads `config?, ...middlewares, last`: an object before the middlewares
 * is the options, and the last argument ends the route, which `isLast`
 * checks.
 */
export function routeArgs<Last>(
	label: string,
	rest: readonly unknown[],
	isLast: (last: unknown) => last is Last,
	what: string,
): RouteArgs<Last> {
	const args = [...rest];
	const last = args.pop();
	// A `validate(…)` or `responds(…)` last is a forgotten handler, not one.
	if (!isLast(last) || builtinOf(last) !== undefined) {
		throw new TypeError(`${label}: the ${what} is missing`);
	}
	if (args.some((arg) => Array.isArray(arg))) {
		throw new TypeError(
			`${label}: a route takes its middlewares after the path, not in a list: drop the brackets`,
		);
	}
	const config =
		args[0] !== null && typeof args[0] === 'object'
			? (args.shift() as Record<string, unknown>)
			: {};
	return { config, middlewares: args, last };
}

/** A route's chain, from its arguments, and the options it declares. */
export function routeChain(
	label: string,
	{ config, middlewares }: RouteArgs<unknown>,
	socket = false,
): { readonly derive: readonly ChainHook[]; readonly schema: RouteSchema } {
	const steps = middlewares.map((middleware, index) =>
		stepOf(middleware, index, label),
	);
	if (socket && steps.some((step) => step.kind === 'responds')) {
		throw new TypeError(
			`${label}: responds() checks replies, and a socket route sends none: check its messages with the \`send\` option`,
		);
	}
	const schemas = SCHEMAS.filter((key) => config[key] !== undefined);
	if (schemas.length > 0) {
		throw new TypeError(
			`${label}: the options hold no schema (${schemas.join(', ')}): give validate(…) and responds(…) among the middlewares`,
		);
	}
	return { derive: steps, schema: config as RouteSchema };
}

/** A middleware as a step of the chain: `validate` and `responds` are the chain's own. */
function stepOf(middleware: unknown, index: number, label: string): ChainHook {
	if (typeof middleware !== 'function') {
		throw new TypeError(
			`${label}: middleware ${index + 1} is not a function: a middleware is (ctx, next) => …, or a validate() or responds()`,
		);
	}
	return (
		builtinOf(middleware) ?? { kind: 'middleware', run: middleware as never }
	);
}
