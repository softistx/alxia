/**
 * The middleware forms of `ws` with options first: `app.ws(path, { message,
 * send }, ...middlewares, handlers)`.
 */
import type { PathAt, RoutePath } from '../types/path';
import type { FormSlots } from './forms';
import type { Bare, Ladder } from './ladder';
import type { AppTypes, AppWithRoute, RouteMiddleware } from './route-forms';
import type {
	SocketHandlersAfter,
	SocketOptions,
	SocketOptionsOnly,
} from './socket-forms';

declare module './forms' {
	interface Forms<
		App extends AppTypes,
		A,
		B,
		Results extends readonly unknown[],
		Result,
		Handled,
	> {
		readonly socketOptions: SocketOptionsForm<App, A, B, Results, Result>;
	}
}

/** `app.ws(path, options, ...middlewares, handlers)`: `SocketForm`, the options after the path. */
export interface SocketOptionsForm<
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
	Result,
> extends FormSlots {
	readonly aBound: RoutePath;
	readonly bBound: SocketOptions;
	readonly head: [
		path: PathAt<App['prefix'], A & string>,
		options: SocketOptionsOnly<B>,
	];
	readonly step: RouteMiddleware<App, A & string, Results, Result>;
	readonly tail: [handlers: SocketHandlersAfter<App, A & string, Results, B>];
	readonly out: AppWithRoute<App>;
}

/** `app.ws(path, options, ...middlewares, handlers)`: see `SocketForms`. */
export interface SocketOptionsForms<App extends AppTypes>
	extends Bare<'socketOptions', App>,
		Ladder<'socketOptions', App> {}
