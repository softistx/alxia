/**
 * The factories this package exports, given uncalled: each throws where
 * it is declared, naming itself, rather than answering every request 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { secureHeaders } from './secure-headers';

describe('given uncalled, a factory throws at declaration', () => {
	test('secureHeaders', () => {
		expect(() => alxia().use(secureHeaders as never)).toThrow(
			'use(): argument 1 looks like a factory (secureHeaders): call it, use(secureHeaders())',
		);
	});
});
