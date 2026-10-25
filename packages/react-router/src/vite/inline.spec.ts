import { describe, expect, test } from 'bun:test';
import { dropDevelopment } from './bun';
import { inlinedFile } from './inline';

describe('dropDevelopment', () => {
	test('removes every development condition, in place', () => {
		const conditions = ['development', 'node', 'development', 'bun'];
		dropDevelopment(conditions);
		expect(conditions).toEqual(['node', 'bun']);
	});

	test('leaves a list without one, and an unset list, as they are', () => {
		const conditions = ['node', 'module-sync'];
		dropDevelopment(conditions);
		expect(conditions).toEqual(['node', 'module-sync']);
		expect(() => dropDevelopment(undefined)).not.toThrow();
	});
});

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
