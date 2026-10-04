import type { AnyReply } from '../reply/reply';
import type { JoinPath, PathAt, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type { OperationForms } from './operation-forms';
import type { RouteApp } from './route-method';
import type {
	AnyRouteHook,
	Context,
	Empty,
	HandlerResult,
	MaybePromise,
	Method,
	RouteHookBase,
	RouteSchema,
	ThreadHooks,
	ValidSchema,
} from './types';
import { mixed } from './route-steps';
import { builtinOf, responds, validate } from './validate';

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
 * `app.route(operation, ...middlewares, handler)`, see `OperationForms`;
 * and the form of 0.3, deprecated: a list of hooks before the handler.
 */
export interface OperationMethod<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> extends OperationForms<RouteApp<Method, Ctx, Prefix, Shortcuts>>,
		DeprecatedOperationForm<Ctx, Prefix, Shortcuts> {}

/** The form of `route` that 0.3 had, which the middleware form replaces. */
export interface DeprecatedOperationForm<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * @deprecated A list of hooks before the handler: give them as
	 * middlewares, made by `defineMiddleware` —
	 * `route(operation, ...middlewares, handler)`, see the upgrading guide.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: one overload of `route`, deprecated on its own
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
	): Alxia<Ctx, Prefix, Shortcuts>;
}

/**
 * What `route(operation, ...rest)` passes `app[method]` after the path. The
 * form of 0.3, a list of hooks first: the list, the operation's schema, the
 * handler. Otherwise its options, the middlewares, then a `validate` of its
 * request parts and a `responds` of its responses, just before the
 * handler: the `responds` checks the handler's reply alone, never a
 * middleware's — an auth's 401 is its own. A `validate(operation)` among
 * the middlewares — a `validate` of each of its parts by the same schemas —
 * stands where it is given, and so does a `responds(operation)`; the
 * implicit one is then left out.
 */
export function operationArgs(
	operation: RouteOperation,
	rest: readonly unknown[],
): unknown[] {
	const schema = operation.schema ?? {};
	if (Array.isArray(rest[0])) {
		if (rest.length > 2) throw mixed(`${operation.method} ${operation.path}`);
		return [rest[0], schema, rest[1]];
	}
	const { params, query, headers, cookies, body, response, ...options } =
		schema;
	const parts = Object.fromEntries(
		Object.entries({ params, query, headers, cookies, body }).filter(
			([, part]) => part !== undefined,
		),
	);
	const middlewares = rest.slice(0, -1);
	const steps = middlewares.map(builtinOf);
	// The operation's validate placed among them: one that validates each of
	// its parts with the very schema the operation names for it.
	const validated =
		Object.keys(parts).length === 0 ||
		steps.some(
			(step) =>
				step?.kind === 'validate' &&
				Object.entries(parts).every(
					([part, schema]) =>
						step.schemas[part as keyof typeof step.schemas] === schema,
				),
		);
	const responded =
		response === undefined ||
		steps.some(
			(step) => step?.kind === 'responds' && step.responses === response,
		);
	return [
		options,
		...middlewares,
		...(validated ? [] : [validate(parts as never)]),
		...(responded ? [] : [responds(response as never)]),
		...rest.slice(-1),
	];
}
