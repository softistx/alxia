import type { Alxia } from '@alxia/core';
import type { graphqlSocket } from './ws';

/** The body limit of a `POST` when neither the option nor the app gives one: 1 MiB. */
const DEFAULT_BODY_LIMIT = 1_048_576;

/** `GET` and `POST` at `path` on `app`, and the WebSocket when `ws` is on. */
export function declareEndpoint(
	app: Alxia<never, string>,
	path: string,
	handler: unknown,
	bodyLimit: number | undefined,
	socket: ReturnType<typeof graphqlSocket> | undefined,
): void {
	const route = app as unknown as {
		get(path: string, handler: unknown): unknown;
		post(path: string, ...rest: unknown[]): unknown;
		ws(path: string, ...rest: unknown[]): unknown;
	};
	route.get(path, handler);
	// The GET just declared has the POST's scope: the limit an earlier
	// `bodyLimit()` gives it is the one the POST keeps.
	const inherited = app.routes.at(-1)?.bodyLimit;
	route.post(
		path,
		{ bodyLimit: bodyLimit ?? inherited ?? DEFAULT_BODY_LIMIT },
		handler,
	);
	if (socket !== undefined) {
		route.ws(socket.path, socket.middleware, socket.handlers);
	}
}
