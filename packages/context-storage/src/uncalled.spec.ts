/**
 * The factories this package exports, given uncalled: each throws where
 * it is declared, naming itself, rather than answering every request 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { contextStorage } from './storage';

describe('given uncalled, a factory throws at declaration', () => {
	test('contextStorage', () => {
		expect(() => alxia().use(contextStorage as never)).toThrow(
			'use(): argument 1 looks like a factory (contextStorage): call it, use(contextStorage())',
		);
	});
});
