import type { AnyReply } from '../reply/reply';
import type { JoinPath, PathAt, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type {
	AnyRouteHook,
	Context,
	Empty,
	HandlerResult,
	MaybePromise,
	Method,
	RouteEntryOf,
	RouteHookBase,
	RouteSchema,
	ThreadHooks,
	ValidSchema,
} from './types';

type IsUnion<T, All = T> = T extends unknown
	? [All] extends [T]
		? false
		: true
	: never;

/**
 * One method, as a literal: an operation typed `RouteOperation`, or whose
 * method is a union, would put its route under every method it names and
 * register it under one.
 */
type OneMethod<M> =
	true extends IsUnion<M>
		? 'route() needs one method: declare the operation as const'
		: M;

/**
 * The path, as a literal: a widened one would name no route. And one a
 * route may be declared at, under `Prefix`.
 */
type OnePath<Prefix extends string, P extends string> = RoutePath extends P
	? 'route() needs the path as a literal: declare the operation as const'
	: PathAt<Prefix, P>;

/**
 * A route as data: its method, its path and its options. What
 * `app.route(operation, handler)` declares — generated from an OpenAPI
 * document, or written by hand.
 */
export interface RouteOperation {
	readonly method: Method;
	readonly path: RoutePath;
	readonly schema?: RouteSchema;
}

/** The options of an operation: its `schema`, or none. */
export type OperationSchema<Operation> = Operation extends {
	readonly schema: infer Schema extends RouteSchema;
}
	? Schema
	: Empty;

/** What `route()` checks of an operation: one method, a literal path at `Prefix`, a schema that reads the path. */
export type CheckedOperation<
	Prefix extends string,
	Operation extends RouteOperation,
> =
	OnePath<Prefix, Operation['path']> extends Operation['path']
		? Operation & {
				readonly method: OneMethod<Operation['method']>;
				readonly schema?: ValidSchema<
					JoinPath<Prefix, Operation['path']>,
					OperationSchema<Operation>
				>;
			}
		: { readonly path: OnePath<Prefix, Operation['path']> };

/**
 * `app.route(operation, handler)`: a route declared as data — `{ method,
 * path, schema? }`, as an OpenAPI code generator writes it — and its
 * handler, the same route as `app[method](path, schema, handler)`,
 * with the three read from `operation`. With a list of hooks before the
 * handler, `app[method](path, hooks, schema, handler)`.
 */
export interface OperationMethod<
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	<
		const Operation extends RouteOperation,
		Result extends HandlerResult<OperationSchema<Operation>>,
	>(
		operation: CheckedOperation<Prefix, Operation>,
		handler: (
			ctx: Context<
				Ctx,
				JoinPath<Prefix, Operation['path']>,
				OperationSchema<Operation>
			>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes &
			RouteEntryOf<
				Operation['method'],
				JoinPath<Prefix, Operation['path']>,
				OperationSchema<Operation>,
				Result,
				Shortcuts
			>,
		Prefix,
		Shortcuts
	>;
	<
		const Operation extends RouteOperation,
		const Hooks extends readonly [] | readonly AnyRouteHook[],
		Result extends HandlerResult<OperationSchema<Operation>>,
	>(
		operation: CheckedOperation<Prefix, Operation>,
		hooks: Hooks &
			NoInfer<
				ThreadHooks<
					RouteHookBase<Ctx, JoinPath<Prefix, Operation['path']>>,
					Hooks
				>['checks']
			>,
		handler: (
			ctx: Context<
				Ctx &
					ThreadHooks<
						RouteHookBase<Ctx, JoinPath<Prefix, Operation['path']>>,
						Hooks
					>['added'],
				JoinPath<Prefix, Operation['path']>,
				OperationSchema<Operation>
			>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes &
			RouteEntryOf<
				Operation['method'],
				JoinPath<Prefix, Operation['path']>,
				OperationSchema<Operation>,
				Result,
				| Shortcuts
				| ThreadHooks<
						RouteHookBase<Ctx, JoinPath<Prefix, Operation['path']>>,
						Hooks
				  >['replies']
			>,
		Prefix,
		Shortcuts
	>;
}

/**
 * What `route(operation, ...rest)` passes `app[method]` after the path: the
 * list of hooks, if any, the operation's schema, then the handler.
 */
export function operationArgs(
	operation: RouteOperation,
	rest: readonly unknown[],
): unknown[] {
	const schema = operation.schema ?? {};
	return Array.isArray(rest[0])
		? [rest[0], schema, rest[1]]
		: [schema, rest[0]];
}
