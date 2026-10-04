/**
 * A socket route: the upgrade request, run through the route's hooks and
 * validated as a route's, then each message checked by its schema and each
 * one sent checked by its own.
 */
import {
	ResponseValidationError,
	type ValidationErrorBody,
} from '../errors/errors';
import type { BodyParser } from '../request/read';
import { check, type StandardSchemaV1 } from '../schema/standard-schema';
import type { Socket } from '../ws/types';
import { fail, RUN } from './boundary';
import { chain } from './chain';
import { routeContext } from './context';
import type { SocketDefinition } from './definition';
import { routingError } from './send';
import type { MaybePromise, RequestContext } from './types';

/** What the pipeline returns once a socket is open: Bun wants no response then. */
export const UPGRADED = Symbol('upgraded');

/** What Bun keeps on each socket: its route, the context its hooks built, and its `Socket`. */
export interface SocketData {
	readonly definition: SocketDefinition;
	readonly ctx: Record<string, unknown>;
	socket?: Socket<unknown, unknown>;
}

/** The upgrade request of a socket route: its hooks, its validation, then the upgrade. */
export async function upgradeSocket(
	definition: SocketDefinition,
	request: RequestContext,
	rawParams: Record<string, string>,
	parsers: readonly BodyParser[],
	validateResponses: boolean,
): Promise<Response | typeof UPGRADED> {
	const { ctx, set } = routeContext(
		definition,
		request,
		rawParams,
		definition.path,
	);
	const server = request.server;
	try {
		const run = {
			definition,
			request,
			rawParams,
			set,
			parsers,
			validateResponses,
		};
		(ctx as { [RUN]?: typeof run })[RUN] = run;
		return await chain<typeof UPGRADED>(run, ctx, async (validated) => {
			if (server === undefined) {
				return routingError(426, 'upgrade_required');
			}
			const headers = new Headers(set.headers);
			if ((set as { touched?: () => boolean }).touched?.()) {
				for (const cookie of set.cookies.toSetCookieHeaders()) {
					headers.append('set-cookie', cookie);
				}
			}
			const data: SocketData = { definition, ctx: validated };
			const upgraded = server.upgrade(request.request, { headers, data });
			return upgraded ? UPGRADED : routingError(426, 'upgrade_required');
		});
	} catch (error) {
		(request as { error: unknown }).error = error;
		return fail(definition, error, ctx, validateResponses);
	}
}

/** The `websocket` handler `Bun.serve` runs every open socket through. */
export function websocketHandler(
	validate: boolean,
): Bun.WebSocketHandler<SocketData> {
	const socketOf = (ws: Bun.ServerWebSocket<SocketData>) => {
		ws.data.socket ??= createSocket(ws, validate);
		return ws.data.socket;
	};
	const guard = async (
		ws: Bun.ServerWebSocket<SocketData>,
		run: () => MaybePromise<void>,
	) => {
		try {
			await run();
		} catch (error) {
			console.error(error);
			ws.close(1011, 'internal error');
		}
	};
	return {
		open: (ws) =>
			guard(ws, () =>
				ws.data.definition.handlers.open?.(socketOf(ws) as never),
			),
		message: (ws, raw) =>
			guard(ws, async () => {
				const { definition } = ws.data;
				const socket = socketOf(ws);
				const schema = definition.schema.message;
				let message: unknown =
					typeof raw === 'string' ? raw : new Uint8Array(raw);
				if (schema !== undefined) {
					const parsed = parseMessage(message);
					if (!parsed.ok) {
						ws.send(JSON.stringify(parsed.error));
						return;
					}
					const checked = await check(schema, parsed.value, 'message');
					if (!checked.ok) {
						const error: ValidationErrorBody = {
							error: 'validation',
							issues: checked.issues,
						};
						ws.send(JSON.stringify(error));
						return;
					}
					message = checked.value;
				}
				await definition.handlers.message(socket as never, message as never);
			}),
		close: (ws, code, reason) =>
			guard(ws, () =>
				ws.data.definition.handlers.close?.(
					socketOf(ws) as never,
					code,
					reason,
				),
			),
		drain: (ws) =>
			guard(ws, () =>
				ws.data.definition.handlers.drain?.(socketOf(ws) as never),
			),
	};
}

function parseMessage(
	message: unknown,
):
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly error: ValidationErrorBody } {
	if (typeof message !== 'string') return { ok: true, value: message };
	try {
		return { ok: true, value: JSON.parse(message) };
	} catch {
		return {
			ok: false,
			error: {
				error: 'validation',
				issues: [
					{
						target: 'message',
						path: [],
						code: 'invalid_json',
						message: 'The message is not valid JSON',
					},
				],
			},
		};
	}
}

function createSocket(
	ws: Bun.ServerWebSocket<SocketData>,
	validate: boolean,
): Socket<unknown, unknown> {
	const schema: StandardSchemaV1 | undefined = ws.data.definition.schema.send;
	const encode = async (message: unknown): Promise<string> => {
		if (schema === undefined || !validate) return JSON.stringify(message);
		const checked = await check(schema, message, 'body');
		if (!checked.ok) {
			throw new ResponseValidationError(
				'WS',
				ws.data.definition.path,
				101,
				checked.issues,
			);
		}
		return JSON.stringify(checked.value);
	};
	return {
		data: ws.data.ctx,
		async send(message) {
			ws.send(await encode(message));
		},
		async publish(topic, message) {
			ws.publish(topic, await encode(message));
		},
		subscribe: (topic) => ws.subscribe(topic),
		unsubscribe: (topic) => ws.unsubscribe(topic),
		isSubscribed: (topic) => ws.isSubscribed(topic),
		close: (code, reason) => ws.close(code, reason),
		raw: ws as Bun.ServerWebSocket<unknown>,
	};
}
