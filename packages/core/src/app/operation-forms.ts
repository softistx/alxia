/**
 * The middleware form of `app.route`: `route(operation, ...middlewares,
 * handler)`, the operation's schemas as an implicit `validate` and an
 * implicit `responds`, just before the handler.
 */
import type { FormSlots } from './forms';
import type { Bare, Ladder } from './ladder';
import type {
	OperationApp,
	OperationResponds,
	OperationValidate,
} from './operation-types';
import type {
	AppTypes,
	AppWithRoute,
	RouteBase,
	RouteHandler,
	RouteReads,
	RouteResult,
} from './route-forms';
import type { CheckedOperation, RouteOperation } from './route-operation';
import type { ThreadContext } from './types';

/** The context the implicit `validate` reads: the middlewares'. */
type BeforeValidate<
	App extends AppTypes,
	Op extends RouteOperation,
	Results extends readonly unknown[],
> = ThreadContext<RouteBase<OperationApp<App, Op>, Op['path']>, Results>;
/** The results the route threads: the middlewares', the implicit `validate`, the implicit `responds`. */
type Steps<
	App extends AppTypes,
	Op extends RouteOperation,
	Results extends readonly unknown[],
> = [
	...Results,
	OperationValidate<Op, BeforeValidate<App, Op, Results>>,
	OperationResponds<Op>,
];
/** `A`, the operation a call inferred, as an operation. */
type OpOf<A> = A extends RouteOperation ? A : never;

declare module './forms' {
	interface Forms<
		App extends AppTypes,
		A,
		B,
		Results extends readonly unknown[],
		Handled,
	> {
		readonly operation: OperationForm<App, OpOf<A>, Results, Handled>;
	}
}

/** `app.route(operation, ...middlewares, handler)`. */
export interface OperationForm<
	App extends AppTypes,
	Op extends RouteOperation,
	Results extends readonly unknown[],
	Handled,
> extends FormSlots {
	readonly aBound: RouteOperation;
	readonly handledBound: RouteResult<Steps<App, Op, Results>>;
	readonly head: [operation: CheckedOperation<App['prefix'], Op>];
	readonly reads: RouteReads<OperationApp<App, Op>, Op['path'], Results>;
	readonly tail: [
		handler: RouteHandler<
			OperationApp<App, Op>,
			Op['path'],
			Steps<App, Op, Results>,
			Handled
		>,
	];
	readonly out: AppWithRoute<App>;
}

/**
 * `app.route(operation, ...middlewares, handler)`: the route
 * `app[method](path, options, ...middlewares, validate(parts),
 * responds(response), handler)` declares, read from `operation`: the
 * operation's responses check the handler's reply, not a middleware's. A
 * `validate(operation)` or a `responds(operation)` among the middlewares
 * stands where it is given, and the implicit one is left out. Up to 8
 * middlewares.
 *
 * ```ts
 * app.route(operations.updatePet, auth, ({ user, params, body, reply }) =>
 *   reply(200, update(user, params.petId, body)));
 * ```
 */
export interface OperationForms<App extends AppTypes>
	extends Bare<'operation', App>,
		Ladder<'operation', App> {}
