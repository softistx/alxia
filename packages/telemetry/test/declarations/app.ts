// An app behind telemetry, behind exported functions whose return types are
// inferred: a declaration build must be able to name each one through
// `@alxia/telemetry`, `@alxia/core` and `@nxgt/telemetry` alone (TS2883
// otherwise).
import { alxia } from '@alxia/core';
import { telemetry } from '@alxia/telemetry';
import { createTelemetry } from '@nxgt/telemetry';

const tracing = telemetry({
	instance: createTelemetry('checkout'),
	traced: ({ url }) => url.pathname !== '/health',
	traceResponse: true,
});

export function traced() {
	return alxia()
		.use(tracing)
		.get('/', ({ span, telemetry: instance, reply }) =>
			reply(200, {
				traced: span !== undefined,
				closing: typeof instance.close,
			}),
		);
}

export function tracer() {
	return telemetry({ service: 'checkout' });
}
