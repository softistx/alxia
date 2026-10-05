/**
 * The factories this package exports, given uncalled: each throws where
 * it is declared, naming itself, rather than answering every request 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { proxy } from './index';

describe('given uncalled, a factory throws at declaration', () => {
	test('proxy', () => {
		expect(() => alxia().use(proxy as never)).toThrow(
			'use(): argument 1 looks like a factory (proxy): call it, use(proxy())',
		);
	});

	test('proxy.mount', () => {
		expect(() => alxia().plugin(proxy.mount as never)).toThrow(
			'plugin(): argument 1 looks like a factory (mount): call it, plugin(mount())',
		);
	});

	test('the middleware proxy() makes is named, for the route table', () => {
		expect(proxy('http://up.internal').name).toBe('proxy');
	});
});
