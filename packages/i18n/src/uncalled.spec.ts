/**
 * The factories this package exports, given uncalled: each throws where
 * it is declared, naming itself, rather than answering every request 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createI18n } from './i18n';

describe('given uncalled, a factory throws at declaration', () => {
	test('createI18n', () => {
		expect(() => alxia().use(createI18n as never)).toThrow(
			'use(): argument 1 looks like a factory (createI18n): call it, use(createI18n())',
		);
	});
});
