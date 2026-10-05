import { afterEach, describe, expect, test } from 'bun:test';
import { alxia, trustProxy } from '@alxia/core';
import {
	createTelemetry,
	type Exporter,
	type Signal,
	type SpanRecord,
	uninstallTelemetry,
} from '@nxgt/telemetry';
import { SERVER_ADDRESS, SERVER_PORT, URL_SCHEME } from './attributes';
import { telemetry } from './telemetry';

afterEach(() => uninstallTelemetry());

/** A server whose every connection comes from `peer`. */
const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

const saidByTlsProxy = {
	'x-forwarded-for': '203.0.113.9',
	'x-forwarded-proto': 'https',
	'x-forwarded-host': 'api.example.com',
};

async function spanOf(behind: boolean, peer: string): Promise<SpanRecord> {
	const signals: Signal[] = [];
	const exporter: Exporter = {
		export(_resource, batch) {
			signals.push(...batch);
		},
	};
	const instance = createTelemetry('alxia-test', {
		exporters: [exporter],
		batch: 1,
	});
	const app = alxia(
		behind ? { proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) } : {},
	)
		.use(telemetry({ instance }))
		.get('/', ({ reply }) => reply(200, { ok: true }));
	await app.fetch(
		new Request('http://app.internal:3000/', { headers: saidByTlsProxy }),
		from(peer),
	);
	return signals.find((s): s is SpanRecord => s.type === 'span') as SpanRecord;
}

describe('the span behind a trusted TLS proxy', () => {
	test('records the scheme and host the proxy said', async () => {
		const { attributes } = await spanOf(true, '10.0.0.1');
		expect(attributes[URL_SCHEME]).toBe('https');
		expect(attributes[SERVER_ADDRESS]).toBe('api.example.com');
		expect(attributes[SERVER_PORT]).toBeUndefined();
	});

	test('without trustProxy, it records the request as received', async () => {
		const { attributes } = await spanOf(false, '10.0.0.1');
		expect(attributes[URL_SCHEME]).toBe('http');
		expect(attributes[SERVER_ADDRESS]).toBe('app.internal');
		expect(attributes[SERVER_PORT]).toBe(3000);
	});

	test('a direct client spoofing the headers changes nothing', async () => {
		const { attributes } = await spanOf(true, '198.51.100.4');
		expect(attributes[URL_SCHEME]).toBe('http');
		expect(attributes[SERVER_ADDRESS]).toBe('app.internal');
		expect(attributes[SERVER_PORT]).toBe(3000);
	});
});
