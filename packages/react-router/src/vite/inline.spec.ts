import { describe, expect, test } from 'bun:test';
import { alxia } from './index';
import { inlineAliases, inlinedFile } from './inline';

describe('inlinedFile', () => {
	test('names the files of /entry and /document', () => {
		expect(inlinedFile('@alxia/react-router/entry')).toMatch(
			/entry[\\/]index\.js$/,
		);
		expect(inlinedFile('@alxia/react-router/document')).toMatch(
			/document[\\/]index\.js$/,
		);
	});

	test('nothing else', () => {
		expect(inlinedFile('@alxia/react-router')).toBeUndefined();
		expect(inlinedFile('react-router')).toBeUndefined();
	});
});

describe('inlineAliases', () => {
	test('aliases /entry and /document to themselves, nothing else', () => {
		expect(inlineAliases().resolve.alias).toEqual([
			{
				find: '@alxia/react-router/entry',
				replacement: '@alxia/react-router/entry',
			},
			{
				find: '@alxia/react-router/document',
				replacement: '@alxia/react-router/document',
			},
		]);
	});

	test('alxia() returns them under serve only', () => {
		const plugin = alxia();
		const hook = plugin.config as (
			config: object,
			env: { command: string; mode: string },
		) => { resolve?: { alias?: unknown[] } } | undefined;
		const meta = { meta: {} };
		const serve = hook.call(
			meta,
			{},
			{ command: 'serve', mode: 'development' },
		);
		expect(serve?.resolve?.alias).toHaveLength(2);
		const built = hook.call(meta, {}, { command: 'build', mode: 'production' });
		expect(built?.resolve).toBeUndefined();
	});
});
