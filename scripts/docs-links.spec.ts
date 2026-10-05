import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { ROOT } from './artifacts/packages';
import {
	anchorsOf,
	linksOf,
	localTarget,
	problemsOf,
	slug,
} from './docs-links';

describe('slug', () => {
	test('lowercases, drops punctuation, turns spaces into hyphens', () => {
		expect(slug('Start in 5 minutes')).toBe('start-in-5-minutes');
		expect(slug('`app.request`: in process')).toBe('apprequest-in-process');
		expect(slug('[Spec first](spec.md) & more')).toBe('spec-first--more');
	});

	test('keeps what a code span holds, angle brackets included', () => {
		expect(slug("`Property 'env' on 'MiddlewareContext<Empty>'.`")).toBe(
			'property-env-on-middlewarecontextempty',
		);
	});
});

describe('anchorsOf', () => {
	test('a repeated heading is suffixed, a heading in a fence is not one', () => {
		const anchors = anchorsOf(
			'# A\n\n## B\n\n## B\n\n```md\n# Not a heading\n```\n',
		);
		expect([...anchors]).toEqual(['a', 'b', 'b-1']);
	});
});

describe('linksOf', () => {
	test('reads inline links and definitions, not code', () => {
		const links = linksOf(
			[
				'[a](x.md#top) and `[b](no.md)`',
				'```',
				'[c](no.md)',
				'```',
				'[ref]: y.md',
			].join('\n'),
		);
		expect(links.map((link) => link.target)).toEqual(['x.md#top', 'y.md']);
	});
});

describe('localTarget', () => {
	const from = join(ROOT, 'docs/start.md');

	test('follows a relative link and this repository on develop, not another site', () => {
		expect(localTarget(from, 'recipes/errors.md#x')).toEqual({
			file: join(ROOT, 'docs/recipes/errors.md'),
			anchor: 'x',
		});
		expect(
			localTarget(
				from,
				'https://github.com/softistx/alxia/blob/develop/AGENTS.md#principles',
			),
		).toEqual({ file: join(ROOT, 'AGENTS.md'), anchor: 'principles' });
		expect(localTarget(from, 'https://example.com/a.md')).toBeNull();
		expect(localTarget(from, 'mailto:a@b.c')).toBeNull();
	});
});

describe('problemsOf', () => {
	test('names a missing file and a missing anchor', () => {
		const from = join(ROOT, 'README.md');
		const anchorsFor = (file: string) =>
			file === from ? new Set(['alxia']) : null;
		const problems = problemsOf(
			from,
			'[a](#alxia) [b](#nowhere) [c](docs/nope.md)',
			anchorsFor,
		);
		expect(problems).toHaveLength(2);
		expect(problems[0]).toContain('#nowhere');
		expect(problems[1]).toContain('no such file');
	});
});
