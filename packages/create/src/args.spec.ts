import { describe, expect, test } from 'bun:test';
import { parseArgs } from './args';

describe('parseArgs', () => {
	test('no arguments: nothing given, so everything is asked', () => {
		expect(parseArgs([])).toEqual({ install: true, help: false });
	});

	test('a directory and a template, in either order and either form', () => {
		const expected = {
			dir: 'my-app',
			template: 'react-router' as const,
			install: true,
			help: false,
		};
		expect(parseArgs(['my-app', '--template', 'react-router'])).toEqual(
			expected,
		);
		expect(parseArgs(['--template=react-router', 'my-app'])).toEqual(expected);
		expect(parseArgs(['-t', 'react-router', 'my-app'])).toEqual(expected);
	});

	test('--no-install and --help', () => {
		expect(parseArgs(['app', '--no-install'])).toEqual({
			dir: 'app',
			install: false,
			help: false,
		});
		expect(parseArgs(['--help'])).toMatchObject({ help: true });
		expect(parseArgs(['-h'])).toMatchObject({ help: true });
	});

	test('refuses an unknown template, a template missing, an unknown option, two directories', () => {
		expect(parseArgs(['--template', 'vue'])).toEqual({
			error: 'unknown template vue: use api or react-router.',
		});
		expect(parseArgs(['--template'])).toEqual({
			error: '--template needs a template: api or react-router.',
		});
		expect(parseArgs(['--yes'])).toEqual({ error: 'unknown option --yes.' });
		expect(parseArgs(['a', 'b'])).toEqual({
			error: 'one directory only, given a and b.',
		});
	});
});
