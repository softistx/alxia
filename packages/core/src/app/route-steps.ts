/**
 * How the arguments of a route method, after its path, become its chain:
 * its list of hooks, its options or schema, its middlewares and what ends
 * it — the handler, or a socket's handlers.
 */
import { routeHooks } from './define-hook';
import type { ChainHook } from './definition';
import type { ResponseSchemas, RouteSchema } from './types';
import { builtinOf, type RequestSchemas } from './validate';

/** The arguments after the path, read. */
export interface RouteArgs<Last> {
	/** The route's list of hooks, the form of 0.3; none, empty. */
	readonly list: readonly unknown[];
	/** Its options; in the form of 0.3, its schema. */
	readonly config: Readonly<Record<string, unknown>>;
	readonly middlewares: readonly unknown[];
	readonly last: Last;
}

const PARTS = ['params', 'query', 'headers', 'cookies', 'body'] as const;

/**
 * Reads `[list]?, config?, ...middlewares, last`: a list first is the hooks
 * of 0.3, an object before the middlewares is the options — or the schema
 * of 0.3 — and the last argument ends the route, which `isLast` checks.
 */
export function routeArgs<Last>(
	label: string,
	rest: readonly unknown[],
	isLast: (last: unknown) => last is Last,
	what: string,
): RouteArgs<Last> {
	const args = [...rest];
	const listed = Array.isArray(args[0]);
	const list = listed ? (args.shift() as unknown[]) : [];
	const last = args.pop();
	// A `validate(…)` or `responds(…)` last is a forgotten handler, not one.
	if (!isLast(last) || builtinOf(last) !== undefined) {
		throw new TypeError(`${label}: the ${what} is missing`);
	}
	const config =
		args[0] !== null && typeof args[0] === 'object'
			? (args.shift() as Record<string, unknown>)
			: {};
	if (listed && args.length > 0) throw mixed(label);
	return { list, config, middlewares: args, last };
}

/** A list of hooks, the form of 0.3, given with middlewares: one would be dropped. */
export function mixed(label: string): TypeError {
	return new TypeError(
		`${label}: a list of hooks and middlewares are two forms, never mixed: give the hooks as middlewares, made by defineMiddleware()`,
	);
}

/** A route's chain, from its arguments, and the schema it declares by them. */
export function routeChain(
	label: string,
	{ list, config, middlewares }: RouteArgs<unknown>,
	socket = false,
): { readonly derive: readonly ChainHook[]; readonly schema: RouteSchema } {
	const steps: ChainHook[] = [
		...routeHooks(list, label),
		...middlewares.map((middleware, index) => stepOf(middleware, index, label)),
	];
	if (socket && steps.some((step) => step.kind === 'responds')) {
		throw new TypeError(
			`${label}: responds() checks replies, and a socket route sends none: check its messages with the \`send\` option`,
		);
	}
	const parts = requestParts(config);
	const response = config['response'] as ResponseSchemas | undefined;
	if (
		middlewares.length > 0 &&
		(Object.keys(parts).length > 0 || response !== undefined)
	) {
		throw new TypeError(
			`${label}: the options hold no schema: give validate(…) and responds(…) among the middlewares`,
		);
	}
	// The form of 0.3: the schema validates the request just before the
	// handler, as then. A route with no middleware and no schema runs none:
	// what a middleware of `use` passed `next` reaches its handler.
	if (middlewares.length === 0 && Object.keys(parts).length > 0) {
		steps.push({ kind: 'validate', schemas: parts, raw: true });
	}
	if (response !== undefined)
		steps.push({ kind: 'responds', responses: response });
	return { derive: steps, schema: config as RouteSchema };
}

/** A middleware as a step of the chain: `validate` and `responds` are the chain's own. */
function stepOf(middleware: unknown, index: number, label: string): ChainHook {
	if (typeof middleware !== 'function') {
		throw new TypeError(
			`${label}: middleware ${index + 1} is not a function: make it with defineMiddleware(), validate() or responds()`,
		);
	}
	return (
		builtinOf(middleware) ?? { kind: 'middleware', run: middleware as never }
	);
}

/** The request parts `config`, a schema of 0.3, has a schema for. */
function requestParts(
	config: Readonly<Record<string, unknown>>,
): RequestSchemas {
	const parts: Record<string, unknown> = {};
	for (const part of PARTS) {
		if (config[part] !== undefined) parts[part] = config[part];
	}
	return parts as RequestSchemas;
}
