/**
 * `reply` and `redirect` as a route's schemas type them, and what its
 * handler may return.
 */
import type { AnyReply, Reply, ReplyInit, Shortcuts } from '../../reply/reply';
import type { InferInput } from '../../schema/standard-schema';
import type { RedirectStatus } from '../../types/status';
import type {
	ResponseSchemaAt,
	ResponseSchemas,
	ResponsesOf,
	StatusOf,
} from './schema';

/** The rest of `reply(status, ...)`: the body may be left out when the schema takes `undefined`. */
type ReplyRest<Body> = undefined extends Body
	? [body?: Body, init?: ReplyInit]
	: [body: Body, init?: ReplyInit];

/**
 * `reply` with schemas: only a status the route declares, with a body its
 * schema accepts. A shortcut exists only for a status the route declares:
 * `reply.notFound` is a compile error on a route with no 404.
 */
export type TypedReplyFunction<Responses extends ResponseSchemas> = (<
	const Status extends StatusOf<Responses>,
>(
	status: Status,
	...rest: ReplyRest<InferInput<ResponseSchemaAt<Responses, Status>>>
) => Reply<Status, InferInput<ResponseSchemaAt<Responses, Status>>>) &
	TypedShortcuts<Responses>;

/** The shortcuts of `reply` with schemas: the declared statuses only. */
export type TypedShortcuts<Responses extends ResponseSchemas> = {
	readonly [Name in keyof Shortcuts as Shortcuts[Name] extends StatusOf<Responses>
		? Name extends 'noContent'
			? undefined extends InferInput<ResponseSchemaAt<Responses, 204>>
				? Name
				: never
			: Name
		: never]: Name extends 'noContent'
		? (
				init?: ReplyInit,
			) => Reply<204, InferInput<ResponseSchemaAt<Responses, 204>>>
		: (
				...rest: ReplyRest<
					InferInput<ResponseSchemaAt<Responses, Shortcuts[Name]>>
				>
			) => Reply<
				Shortcuts[Name],
				InferInput<ResponseSchemaAt<Responses, Shortcuts[Name]>>
			>;
} & {
	/** An HTML page, for a declared status whose schema takes a string. */
	readonly html: <const Status extends StatusOf<Responses>>(
		status: Status,
		html: string & InferInput<ResponseSchemaAt<Responses, Status>>,
		init?: ReplyInit,
	) => Reply<Status, InferInput<ResponseSchemaAt<Responses, Status>>>;
};

/** Every reply a route with schemas may return. */
export type DeclaredReply<Responses extends ResponseSchemas> = {
	[Status in StatusOf<Responses>]: Reply<
		Status,
		InferInput<ResponseSchemaAt<Responses, Status>>
	>;
}[StatusOf<Responses>];

export type RedirectFunction = <const Status extends RedirectStatus = 302>(
	location: string | URL,
	status?: Status,
) => Reply<Status, undefined>;

/** What a handler may return. */
export type HandlerResult<Schema> = [ResponsesOf<Schema>] extends [never]
	? AnyReply
	: DeclaredReply<ResponsesOf<Schema>> | Reply<RedirectStatus, undefined>;
