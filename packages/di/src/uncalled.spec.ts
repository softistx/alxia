/**
 * The factories this package exports, given uncalled: each throws where
 * it is declared, naming itself, rather than answering every request 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { services } from '../test/services';
import { di } from './di';

describe('given uncalled, a factory throws at declaration', () => {
	test('di', () => {
		expect(() => alxia().use(di as never)).toThrow(
			'use(): argument 1 looks like a factory (di): call it, use(di())',
		);
	});

	test('expose', () => {
		const deps = di(services(), { slots: () => ({ principal: { id: 'x' } }) });
		expect(() =>
			alxia()
				.use(deps)
				.use(deps.expose as never),
		).toThrow(
			'use(): argument 1 looks like a factory (expose): call it, use(expose())',
		);
	});
});
