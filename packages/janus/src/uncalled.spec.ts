/**
 * The factories this package exports, given uncalled: each throws where
 * it is declared, naming itself, rather than answering every request 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { janusErrors } from './errors';
import { permission } from './permission';
import { session } from './session';

describe('given uncalled, a factory throws at declaration', () => {
	test('session', () => {
		expect(() => alxia().use(session as never)).toThrow(
			'use(): argument 1 looks like a factory (session): call it, use(session())',
		);
	});
	test('permission', () => {
		expect(() => alxia().use(permission as never)).toThrow(
			'use(): argument 1 looks like a factory (permission): call it, use(permission())',
		);
	});
	test('janusErrors', () => {
		expect(() => alxia().use(janusErrors as never)).toThrow(
			'use(): argument 1 looks like a factory (janusErrors): call it, use(janusErrors())',
		);
	});
});
