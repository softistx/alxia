/**
 * The middleware form of a route method, with options first:
 * `app.post(path, { bodyLimit }, ...middlewares, handler)`.
 */
import type { PathAt, RoutePath } from '../types/path';
import type { FormSlots } from './forms';
import type { Bare, Ladder } from './ladder';
import type {
	AppTypes,
	AppWithRoute,
	OptionsOnly,
	RouteHandler,
	RouteMiddleware,
	RouteOptions,
	RouteResult,
} from './route-forms';

declare module './forms' {
	interface Forms<
		App extends AppTypes,
		A,
		B,
		Results extends readonly unknown[],
		Result,
		Handled,
	> {
		readonly routeOptions: RouteOptionsForm<
			App,
			A,
			B,
			Results,
			Result,
			Handled
		>;
	}
}

/** `app.post(path, options, ...middlewares, handler)`: `RouteForm`, the options after the path. */
export interface RouteOptionsForm<
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
	Result,
	Handled,
> extends FormSlots {
	readonly aBound: RoutePath;
	readonly bBound: RouteOptions;
	readonly handledBound: RouteResult<Results>;
	readonly head: [
		path: PathAt<App['prefix'], A & string>,
		options: OptionsOnly<B>,
	];
	readonly step: RouteMiddleware<App, A & string, Results, Result>;
	readonly tail: [handler: RouteHandler<App, A & string, Results, Handled>];
	readonly out: AppWithRoute<App>;
}

/**
 * `app.post(path, options, ...middlewares, handler)`: the middleware form
 * with the route's options — its `bodyLimit`, its `detail` — first. The
 * options hold no schema: that is `validate(…)` and `responds(…)`.
 *
 * ```ts
 * app.post('/upload', { bodyLimit: 25 * 1024 * 1024 }, auth, ({ request, reply }) =>
 *   reply(202, { queued: true }));
 * ```
 */
export interface OptionsForms<App extends AppTypes>
	extends Bare<'routeOptions', App>,
		Ladder<'routeOptions', App> {}
