/**
 * The factories this package exports, given uncalled: each throws where
 * it is declared, naming itself, rather than answering every request 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache } from './cache';

describe('given uncalled, a factory throws at declaration', () => {
	test('cache', () => {
		expect(() => alxia().use(cache as never)).toThrow(
			'use(): argument 1 looks like a factory (cache): call it, use(cache())',
		);
	});
});
