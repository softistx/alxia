/**
 * The factories this package exports, given uncalled: each throws where
 * it is declared, naming itself, rather than answering every request 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { apiDocs } from './api-docs';

describe('given uncalled, a factory throws at declaration', () => {
	test('apiDocs', () => {
		expect(() => alxia().plugin(apiDocs as never)).toThrow(
			'plugin(): argument 1 looks like a factory (apiDocs): call it, plugin(apiDocs())',
		);
	});
});
