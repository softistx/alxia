/**
 * A real server with `@alxia/graphql` over `ws: true`, behind
 * `@alxia/logger` and `@alxia/telemetry` as asked, its log lines and its
 * spans, and a `graphql-ws` client: for the `ws-observed` specs.
 */
import { alxia } from '@alxia/core';
import { type LogEntry, logger } from '@alxia/logger';
import { telemetry } from '@alxia/telemetry';
import {
	createTelemetry,
	type SpanRecord,
	type Telemetry,
	uninstallTelemetry,
} from '@nxgt/telemetry';
import { type Client, createClient } from 'graphql-ws';
import { createSchema } from 'graphql-yoga';
import { graphql } from '../../src/graphql';

const schema = createSchema({
	typeDefs: /* GraphQL */ `
		type Query { notes: [String!]!, boom: String }
		type Mutation { add(text: String!): String! }
		type Subscription { ticks(to: Int!): Int!, broken: Int! }
	`,
	resolvers: {
		Query: {
			notes: () => ['a'],
			boom: () => {
				throw new Error('boom');
			},
		},
		Mutation: { add: (_, args: { text: string }) => args.text },
		Subscription: {
			ticks: {
				async *subscribe(_, args: { to: number }) {
					for (let n = 1; n <= args.to; n++) {
						await Bun.sleep(10);
						yield { ticks: n };
					}
				},
			},
			broken: {
				// biome-ignore lint/correctness/useYield: it fails before its first event
				async *subscribe() {
					throw new Error('broken');
				},
			},
		},
	},
});

export const NOTES = 'query GetNotes { notes }';
export const ADD = 'mutation AddNote { add(text: "b") }';
export const TICKS = 'subscription OnTick { ticks(to: 3) }';

let stop: (() => Promise<void>) | undefined;

/** Stops the server `serve` started last, and uninstalls the telemetry. */
export async function stopServer(): Promise<void> {
	await stop?.();
	stop = undefined;
	uninstallTelemetry();
}

/** A server with the observers asked for, its log lines, its spans. */
export function serve(observers: { logger?: boolean; telemetry?: boolean }) {
	const lines: LogEntry[] = [];
	const spans: SpanRecord[] = [];
	const instance: Telemetry = createTelemetry('alxia-test', {
		exporters: [
			{
				export(_resource, batch) {
					for (const signal of batch) {
						if (signal.type === 'span') spans.push(signal);
					}
				},
			},
		],
		batch: 1,
	});
	let app = alxia();
	if (observers.logger) {
		app = app.use(logger({ write: (entry) => lines.push(entry) }));
	}
	if (observers.telemetry) app = app.use(telemetry({ instance }));
	const served = app.plugin((app) =>
		graphql(app, { schema, ws: true, logging: false }),
	);
	const server = served.listen({ port: 0, signals: false });
	stop = () => served.stop(true);
	const ws = new URL('/graphql', server.url);
	ws.protocol = 'ws:';
	const client = createClient({
		url: ws.href,
		webSocketImpl: WebSocket,
		retryAttempts: 0,
		lazy: false,
	});
	const flushed = async () => {
		await Bun.sleep(5);
		await instance.close();
		return spans;
	};
	return { app: served, client, lines, flushed };
}

/** Runs `query` on `client` to its end, and whether it ended with errors. */
export function run(client: Client, query: string): Promise<boolean> {
	return new Promise((resolve) => {
		let errors = false;
		client.subscribe(
			{ query },
			{
				next: (result) => {
					errors ||= result.errors !== undefined;
				},
				error: () => resolve(true),
				complete: () => resolve(errors),
			},
		);
	});
}

export const operationLines = (lines: LogEntry[]) =>
	lines.filter((line) => line.operationType !== undefined);
