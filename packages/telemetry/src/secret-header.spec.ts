import { afterEach, describe, expect, test } from 'bun:test';
import { alxia, trustProxy } from '@alxia/core';
import {
	createTelemetry,
	type Exporter,
	type Signal,
	uninstallTelemetry,
} from '@nxgt/telemetry';
import { telemetry } from './telemetry';

afterEach(() => uninstallTelemetry());

describe('the proxy secret header', () => {
	test('appears in no span attribute, for a right or a wrong secret', async () => {
		const secret = 'k3y-0f-sixteen+chars';
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
		const app = alxia({
			proxy: trustProxy({
				trusted: 1,
				secret: { header: 'x-app-proxy-secret', value: secret },
			}),
		})
			.use(telemetry({ instance }))
			.get('/', ({ reply }) => reply(200, { ok: true }));
		for (const sent of [secret, 'a-wrong-secret-value']) {
			await app.request('/', {
				headers: {
					'x-forwarded-for': '203.0.113.9',
					'x-app-proxy-secret': sent,
				},
			});
		}
		expect(signals.length).toBeGreaterThan(0);
		const text = JSON.stringify(signals);
		expect(text).not.toContain(secret);
		expect(text).not.toContain('a-wrong-secret-value');
	});
});
