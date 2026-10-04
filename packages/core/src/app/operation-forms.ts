/**
 * The middleware form of `app.route`: `route(operation, ...middlewares,
 * handler)`, the operation's schemas as an implicit `validate` and an
 * implicit `responds`, just before the handler.
 */
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
	RouteMiddleware,
	RouteResult,
} from './route-forms';
import type { CheckedOperation, RouteOperation } from './route-operation';
import type { MiddlewareReturn, ThreadContext } from './types';

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
/** Middleware `n`, after the ones that returned `Before`. */
type Mw<
	App extends AppTypes,
	Op extends RouteOperation,
	Before extends readonly unknown[],
	Result,
> = RouteMiddleware<OperationApp<App, Op>, Op['path'], Before, Result>;
/** The handler, after the middlewares that returned `Results`. */
type Handler<
	App extends AppTypes,
	Op extends RouteOperation,
	Results extends readonly unknown[],
	Result,
> = RouteHandler<
	OperationApp<App, Op>,
	Op['path'],
	Steps<App, Op, Results>,
	Result
>;
type R = MiddlewareReturn;

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
export interface OperationForms<App extends AppTypes> {
	<
		const Op extends RouteOperation,
		Result extends RouteResult<Steps<App, Op, []>>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		handler: Handler<App, Op, [], Result>,
	): AppWithRoute<App>;
	<
		const Op extends RouteOperation,
		R1 extends R,
		Result extends RouteResult<Steps<App, Op, [R1]>>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		m1: Mw<App, Op, [], R1>,
		handler: Handler<App, Op, [R1], Result>,
	): AppWithRoute<App>;
	<
		const Op extends RouteOperation,
		R1 extends R,
		R2 extends R,
		Result extends RouteResult<Steps<App, Op, [R1, R2]>>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		m1: Mw<App, Op, [], R1>,
		m2: Mw<App, Op, [R1], R2>,
		handler: Handler<App, Op, [R1, R2], Result>,
	): AppWithRoute<App>;
	<
		const Op extends RouteOperation,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		Result extends RouteResult<Steps<App, Op, [R1, R2, R3]>>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		m1: Mw<App, Op, [], R1>,
		m2: Mw<App, Op, [R1], R2>,
		m3: Mw<App, Op, [R1, R2], R3>,
		handler: Handler<App, Op, [R1, R2, R3], Result>,
	): AppWithRoute<App>;
	<
		const Op extends RouteOperation,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		Result extends RouteResult<Steps<App, Op, [R1, R2, R3, R4]>>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		m1: Mw<App, Op, [], R1>,
		m2: Mw<App, Op, [R1], R2>,
		m3: Mw<App, Op, [R1, R2], R3>,
		m4: Mw<App, Op, [R1, R2, R3], R4>,
		handler: Handler<App, Op, [R1, R2, R3, R4], Result>,
	): AppWithRoute<App>;
	<
		const Op extends RouteOperation,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		R5 extends R,
		Result extends RouteResult<Steps<App, Op, [R1, R2, R3, R4, R5]>>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		m1: Mw<App, Op, [], R1>,
		m2: Mw<App, Op, [R1], R2>,
		m3: Mw<App, Op, [R1, R2], R3>,
		m4: Mw<App, Op, [R1, R2, R3], R4>,
		m5: Mw<App, Op, [R1, R2, R3, R4], R5>,
		handler: Handler<App, Op, [R1, R2, R3, R4, R5], Result>,
	): AppWithRoute<App>;
	<
		const Op extends RouteOperation,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		R5 extends R,
		R6 extends R,
		Result extends RouteResult<Steps<App, Op, [R1, R2, R3, R4, R5, R6]>>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		m1: Mw<App, Op, [], R1>,
		m2: Mw<App, Op, [R1], R2>,
		m3: Mw<App, Op, [R1, R2], R3>,
		m4: Mw<App, Op, [R1, R2, R3], R4>,
		m5: Mw<App, Op, [R1, R2, R3, R4], R5>,
		m6: Mw<App, Op, [R1, R2, R3, R4, R5], R6>,
		handler: Handler<App, Op, [R1, R2, R3, R4, R5, R6], Result>,
	): AppWithRoute<App>;
	<
		const Op extends RouteOperation,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		R5 extends R,
		R6 extends R,
		R7 extends R,
		Result extends RouteResult<Steps<App, Op, [R1, R2, R3, R4, R5, R6, R7]>>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		m1: Mw<App, Op, [], R1>,
		m2: Mw<App, Op, [R1], R2>,
		m3: Mw<App, Op, [R1, R2], R3>,
		m4: Mw<App, Op, [R1, R2, R3], R4>,
		m5: Mw<App, Op, [R1, R2, R3, R4], R5>,
		m6: Mw<App, Op, [R1, R2, R3, R4, R5], R6>,
		m7: Mw<App, Op, [R1, R2, R3, R4, R5, R6], R7>,
		handler: Handler<App, Op, [R1, R2, R3, R4, R5, R6, R7], Result>,
	): AppWithRoute<App>;
	<
		const Op extends RouteOperation,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		R5 extends R,
		R6 extends R,
		R7 extends R,
		R8 extends R,
		Result extends RouteResult<
			Steps<App, Op, [R1, R2, R3, R4, R5, R6, R7, R8]>
		>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		m1: Mw<App, Op, [], R1>,
		m2: Mw<App, Op, [R1], R2>,
		m3: Mw<App, Op, [R1, R2], R3>,
		m4: Mw<App, Op, [R1, R2, R3], R4>,
		m5: Mw<App, Op, [R1, R2, R3, R4], R5>,
		m6: Mw<App, Op, [R1, R2, R3, R4, R5], R6>,
		m7: Mw<App, Op, [R1, R2, R3, R4, R5, R6], R7>,
		m8: Mw<App, Op, [R1, R2, R3, R4, R5, R6, R7], R8>,
		handler: Handler<App, Op, [R1, R2, R3, R4, R5, R6, R7, R8], Result>,
	): AppWithRoute<App>;
}
