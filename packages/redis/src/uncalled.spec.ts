/**
 * The factories this package exports, given uncalled: each throws where
 * it is declared, naming itself, rather than answering every request 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { redis } from './context';
import { idempotency } from './idempotency';

describe('given uncalled, a factory throws at declaration', () => {
	test('idempotency', () => {
		expect(() => alxia().use(idempotency as never)).toThrow(
			'use(): argument 1 looks like a factory (idempotency): call it, use(idempotency())',
		);
	});
	test('redis', () => {
		expect(() => alxia().plugin(redis as never)).toThrow(
			'plugin(): argument 1 looks like a factory (redis): call it, plugin(redis())',
		);
	});
});
