import { describe, expect, test } from 'bun:test';
import {
	linesOf,
	missingFrom,
	problemsOf,
	snippetsOf,
} from './docs-snippets/fences';

const doc = [
	'```ts',
	'// file: src/app.ts',
	'export const a = 1;',
	'```',
	'',
	'```ts excerpt',
	'export const a = 1;',
	'```',
	'',
	'```ts no-check',
	'oops(',
	'```',
	'',
	'```yaml',
	'# file: openapi.yaml',
	'openapi: 3.1.0',
	'```',
	'',
	'```sh',
	'bun test',
	'```',
].join('\n');

describe('snippetsOf', () => {
	const snippets = snippetsOf(doc);

	test('reads the file a fence names, and takes the marker out', () => {
		expect(snippets[0]).toMatchObject({
			file: 'src/app.ts',
			lang: 'ts',
			code: 'export const a = 1;\n',
			line: 1,
		});
		expect(snippets[3]).toMatchObject({ file: 'openapi.yaml', lang: 'yaml' });
	});

	test('reads the flags', () => {
		expect(snippets[1]).toMatchObject({ file: null, excerpt: true });
		expect(snippets[2]).toMatchObject({ skipped: true });
	});
});

describe('snippetsOf, fences it must not miss', () => {
	test('an indented fence and a tilde fence are read, not skipped', () => {
		const snippets = snippetsOf(
			'- item\n\n  ```ts\n  const a = 1;\n  ```\n\n~~~ts\nconst b = 2;\n~~~\n',
		);
		expect(snippets.map((snippet) => snippet.lang)).toEqual(['ts', 'ts']);
		expect(problemsOf('doc.md', snippets)).toHaveLength(2);
	});
});

describe('problemsOf', () => {
	test('a ts fence that names no file is refused, unless it is an excerpt or no-check', () => {
		const bare = snippetsOf('```ts\nconst a = 1;\n```\n');
		expect(problemsOf('doc.md', bare)).toHaveLength(1);
		expect(problemsOf('doc.md', snippetsOf(doc))).toEqual([]);
	});

	test('a file written twice, or outside the project, is refused', () => {
		const twice = snippetsOf(
			'```ts\n// file: a.ts\n```\n```ts\n// file: a.ts\n```\n```ts\n// file: ../b.ts\n```\n',
		);
		expect(problemsOf('doc.md', twice)).toHaveLength(2);
	});
});

describe('excerpts', () => {
	test('comments, blank lines and ellipses are not lines to find', () => {
		expect(linesOf('  a\n\n// b\n…\n# c\n  d  ')).toEqual(['a', 'd']);
	});

	test('a line that no source holds is missing', () => {
		expect(missingFrom('a\nb', ['  a  \nc'])).toEqual(['b']);
	});
});
