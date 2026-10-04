/**
 * The middleware form of `app.route`: `route(operation, ...middlewares,
 * handler)`, the operation's schemas as an implicit `responds` first and an
 * implicit `validate` just before the handler.
 */
import type { JoinPath } from '../types/path';
import type {
	OperationApp,
	OperationOptions,
	OperationResponds,
	OperationValidate,
} from './operation-types';
import type {
	AppTypes,
	AppWithRoute,
	RouteHandler,
	RouteMiddleware,
	RouteResult,
} from './route-forms';
import type { CheckedOperation, RouteOperation } from './route-operation';
import type { MiddlewareReturn } from './types';

/** The results the route threads: the implicit `responds`, the middlewares', the implicit `validate`. */
type Steps<
	App extends AppTypes,
	Op extends RouteOperation,
	Results extends readonly unknown[],
> = [
	OperationResponds<Op>,
	...Results,
	OperationValidate<Op, JoinPath<App['prefix'], Op['path']>>,
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
/** The app with the route added. */
type WithRoute<
	App extends AppTypes,
	Op extends RouteOperation,
	Results extends readonly unknown[],
	Result,
> = AppWithRoute<
	OperationApp<App, Op>,
	Op['path'],
	OperationOptions<Op>,
	Steps<App, Op, Results>,
	Result
>;
type R = MiddlewareReturn;

/**
 * `app.route(operation, ...middlewares, handler)`: the route
 * `app[method](path, options, responds(response), ...middlewares,
 * validate(parts), handler)` declares, read from `operation`. A
 * `validate(operation)` among the middlewares stands where it is given, and
 * the implicit one is left out. Up to 8 middlewares.
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
	): WithRoute<App, Op, [], Result>;
	<
		const Op extends RouteOperation,
		R1 extends R,
		Result extends RouteResult<Steps<App, Op, [R1]>>,
	>(
		operation: CheckedOperation<App['prefix'], Op>,
		m1: Mw<App, Op, [], R1>,
		handler: Handler<App, Op, [R1], Result>,
	): WithRoute<App, Op, [R1], Result>;
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
	): WithRoute<App, Op, [R1, R2], Result>;
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
	): WithRoute<App, Op, [R1, R2, R3], Result>;
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
	): WithRoute<App, Op, [R1, R2, R3, R4], Result>;
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
	): WithRoute<App, Op, [R1, R2, R3, R4, R5], Result>;
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
	): WithRoute<App, Op, [R1, R2, R3, R4, R5, R6], Result>;
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
	): WithRoute<App, Op, [R1, R2, R3, R4, R5, R6, R7], Result>;
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
	): WithRoute<App, Op, [R1, R2, R3, R4, R5, R6, R7, R8], Result>;
}
