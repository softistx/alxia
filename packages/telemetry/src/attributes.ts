import type { OperationSummary } from '@alxia/core';
import type { Attributes } from '@nxgt/telemetry';

/**
 * The semantic conventions a server span carries, by name: the ones a
 * backend's HTTP dashboards look for. They are `@nxgt/telemetry-hono`'s
 * names, kept twice on purpose — importing them would make this package
 * depend on Hono — and a server span here and a client span from
 * `@nxgt/telemetry-httpyz` must agree on them.
 */
export const HTTP_METHOD = 'http.request.method';
export const URL_PATH = 'url.path';
export const URL_SCHEME = 'url.scheme';
export const HTTP_ROUTE = 'http.route';
export const HTTP_STATUS = 'http.response.status_code';
export const SERVER_ADDRESS = 'server.address';
export const SERVER_PORT = 'server.port';
export const CLIENT_ADDRESS = 'client.address';
export const GRAPHQL_NAME = 'graphql.operation.name';
export const GRAPHQL_TYPE = 'graphql.operation.type';

/** A 4xx is the server working: only a 5xx marks a span. */
export function serverFailed(status: number): boolean {
	return status >= 500;
}

/**
 * What is known of a request before routing: the route is not, yet. `url`
 * is `originalUrl(ctx)`, so `url.scheme`, `server.address` and
 * `server.port` are the ones the client used behind a trusted proxy.
 */
export function requestAttributes(
	url: URL,
	method: string,
	ip: string | undefined,
): Attributes {
	return {
		[HTTP_METHOD]: method,
		[URL_PATH]: url.pathname,
		[URL_SCHEME]: url.protocol.replace(':', ''),
		[SERVER_ADDRESS]: url.hostname,
		...(url.port === '' ? {} : { [SERVER_PORT]: Number(url.port) }),
		...(ip === undefined ? {} : { [CLIENT_ADDRESS]: ip }),
	};
}

/**
 * A GraphQL request's span, by the OpenTelemetry convention: named
 * `"<type> <name>"`, or `"<type>"` for an anonymous operation, with
 * `graphql.operation.name` and `graphql.operation.type`. A batched body is
 * named `"batch <names>"` and has no type, since `batch` is not one of the
 * convention's values: its name attribute lists every operation's.
 */
export function operationSpan(operation: OperationSummary): {
	readonly name: string;
	readonly attributes: Attributes;
} {
	const { type, name } = operation;
	return {
		name: name === undefined ? type : `${type} ${name}`,
		attributes: {
			...(type === 'batch' ? {} : { [GRAPHQL_TYPE]: type }),
			...(name === undefined ? {} : { [GRAPHQL_NAME]: name }),
		},
	};
}
