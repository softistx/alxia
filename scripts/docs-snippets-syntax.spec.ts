import { describe, expect, test } from 'bun:test';
import { docsToCheck } from './docs-snippets/docs';
import { problemsOf, snippetsOf } from './docs-snippets/fences';
import {
	asCode,
	fragmentProblems,
	importsOf,
	parseProblem,
	swallowedCalls,
} from './docs-snippets/syntax';

const fragment = (code: string) => snippetsOf(`\`\`\`ts\n${code}\n\`\`\`\n`)[0];

describe('a fragment parses', () => {
	test('a comment that swallowed a call is caught', () => {
		// The snippet of api-docs.md that hid `.plugin(apiDocs(…))` in a comment.
		const code = [
			"const app = alxia().group('/internal', (g) =>",
			"\tg.use(requireAdmin) // your own middleware.plugin(apiDocs({ spec: 'openapi.yaml' })),",
			');',
		].join('\n');
		expect(parseProblem(code, 'ts')).toBeNull(); // it parses: the bug is the comment
		expect(swallowedCalls(code)).toHaveLength(1);
		const snippet = fragment(code);
		if (snippet === undefined) throw new Error('no snippet');
		expect(fragmentProblems('doc.md', snippet)[0]).toContain(
			'a comment holds a call',
		);
	});

	test('a comment that says what not to write, or holds no app method, is fine', () => {
		expect(
			swallowedCalls(
				"app.post('/a', h); // not app.post('/a', { body }, h)\nawait q.flush(); // then queue.flush()",
			),
		).toEqual([]);
	});

	test('an unclosed call or brace does not parse', () => {
		expect(parseProblem("app.get('/a', (ctx) => {", 'ts')).not.toBeNull();
		expect(parseProblem("app.get('/a', h));", 'ts')).not.toBeNull();
	});

	test('placeholders, chains, members, bodies and signatures parse', () => {
		expect(asCode('.get(...)')).toBe('__.get(__)');
		for (const code of [
			"app.get('/a', ...);",
			'.derive(({ cookies }) => ({ user: cookies.sid }))',
			'login: async (_, { name }) => { return name; },',
			'return next();',
			'get(key: string): Promise<string | undefined>;',
			'const a = { … };',
			'const a = 1;\nconst a = 2;', // a before and an after
		]) {
			expect(parseProblem(code, 'ts')).toBeNull();
		}
	});
});

describe('a fragment imports what its package declares', () => {
	test('the names are read, `type` and `as` dropped', () => {
		expect(
			importsOf(
				"import { alxia, type Empty, validate as v } from '@alxia/core';\nimport x, { y } from '@alxia/zod';",
			),
		).toEqual(
			new Map([
				['@alxia/core', ['alxia', 'Empty', 'validate']],
				['@alxia/zod', ['y']],
			]),
		);
	});

	test('a name no built package declares is refused', () => {
		const snippet = fragment(
			"import { alxia, notAnExportOfCore } from '@alxia/core';",
		);
		if (snippet === undefined) throw new Error('no snippet');
		const problems = fragmentProblems('doc.md', snippet);
		// Built or not, `notAnExportOfCore` is never accepted.
		expect(problems).toHaveLength(1);
		expect(problems[0]).not.toContain('declares no alxia');
	});
});

describe('which docs, how strictly', () => {
	test('every package README and guide is read, the recipes strictly', () => {
		const docs = docsToCheck([]);
		const strict = docs.filter((doc) => doc.strict).map((doc) => doc.path);
		const paths = docs.map((doc) => doc.path);
		expect(paths.some((doc) => doc.endsWith('packages/core/README.md'))).toBe(
			true,
		);
		expect(
			paths.some((doc) =>
				doc.endsWith('packages/openapi/docs/guide/api-docs.md'),
			),
		).toBe(true);
		expect(strict.some((doc) => doc.endsWith('docs/recipes/testing.md'))).toBe(
			true,
		);
		expect(strict.some((doc) => doc.includes('packages/'))).toBe(false);
		expect(paths.some((doc) => doc.includes('/templates/'))).toBe(false);
	});

	test('a fragment needs no file outside a strict doc', () => {
		const bare = snippetsOf('```ts\nconst a = 1;\n```\n');
		expect(problemsOf('doc.md', bare, false)).toEqual([]);
		expect(problemsOf('doc.md', bare, true)).toHaveLength(1);
	});
});
