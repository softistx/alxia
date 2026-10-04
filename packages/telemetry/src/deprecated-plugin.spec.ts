import { afterEach, describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import {
	createTelemetry,
	type SpanScope,
	uninstallTelemetry,
} from '@nxgt/telemetry';
import { telemetry } from './telemetry';

afterEach(() => uninstallTelemetry());

const tracing = () =>
	telemetry({ instance: createTelemetry('alxia-test'), traceResponse: true });

describe('app.plugin(telemetry()), deprecated', () => {
	test('a route declared after it is traced, and reads span', async () => {
		const app = alxia()
			.plugin(tracing())
			.get('/late', ({ span, reply }) => {
				expectTypeOf(span).toEqualTypeOf<SpanScope | undefined>();
				return reply(200, span !== undefined);
			});
		const response = await app.request('/late');
		expect(await response.json()).toBe(true);
		expect(response.headers.get('traceparent')).not.toBeNull();
	});

	test('a route declared before it is traced too, as 0.3 hooks did', async () => {
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, 'early'))
			.plugin(tracing());
		const response = await app.request('/early');
		expect(response.headers.get('traceparent')).not.toBeNull();
	});
});
