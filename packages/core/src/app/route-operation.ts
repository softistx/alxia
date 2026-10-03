import type { AnyReply } from '../reply/reply';
import type { JoinPath, PathAt, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type {
	Context,
	Empty,
	HandlerResult,
	MaybePromise,
	Method,
	RouteEntryOf,
	RouteSchema,
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

/** `app.route(operation, handler)`: `app[method](path, schema, handler)`, with the three read from `operation`. */
export type OperationMethod<
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> = <
	const Operation extends RouteOperation,
	Result extends HandlerResult<OperationSchema<Operation>>,
>(
	operation: OnePath<Prefix, Operation['path']> extends Operation['path']
		? Operation & {
				readonly method: OneMethod<Operation['method']>;
				readonly schema?: ValidSchema<
					JoinPath<Prefix, Operation['path']>,
					OperationSchema<Operation>
				>;
			}
		: { readonly path: OnePath<Prefix, Operation['path']> },
	handler: (
		ctx: Context<
			Ctx,
			JoinPath<Prefix, Operation['path']>,
			OperationSchema<Operation>
		>,
	) => MaybePromise<Result>,
) => Alxia<
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
