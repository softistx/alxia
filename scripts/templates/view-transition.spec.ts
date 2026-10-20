import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import {
	addReducedMotion,
	addViewTransition,
	atViewTransitionReact,
	REDUCED_MOTION,
	VIEW_TRANSITION_EDITS,
} from './view-transition';

const ROOT = join(import.meta.dir, '../..');

describe('addViewTransition', () => {
	const example = join(ROOT, 'examples/react-router/app/root.tsx');

	test("gives examples/react-router's root.tsx from the scaffold's", async () => {
		const wrapped = await Bun.file(example).text();
		// The scaffold's root.tsx is the example's with every edit undone.
		const scaffold = VIEW_TRANSITION_EDITS.reduceRight(
			(text, [from, to]) => text.replace(to, () => from),
			wrapped,
		);
		expect(scaffold).not.toContain('ViewTransition');
		expect(scaffold).toContain('  return <Outlet />;\n');
		expect(addViewTransition(scaffold)).toBe(wrapped);
	});

	test('keeps a root that already has it', async () => {
		const wrapped = await Bun.file(example).text();
		expect(addViewTransition(wrapped)).toBe(wrapped);
	});

	test('refuses a root where an edit does not find its text exactly once', async () => {
		const wrapped = await Bun.file(example).text();
		const scaffold = VIEW_TRANSITION_EDITS.reduceRight(
			(text, [from, to]) => text.replace(to, () => from),
			wrapped,
		);
		for (const [from] of VIEW_TRANSITION_EDITS) {
			const message = `app/root.tsx: expected ${JSON.stringify(from)} exactly once`;
			expect(() => addViewTransition(scaffold.replace(from, ''))).toThrow(
				message,
			);
			expect(() =>
				addViewTransition(scaffold.replace(from, from + from)),
			).toThrow(message);
		}
	});

	test('refuses, rather than keeps, a root wrapped without update', async () => {
		const wrapped = await Bun.file(example).text();
		const plain = wrapped.replace(
			/<ViewTransition update=\{[^}]*\}>/,
			'<ViewTransition>',
		);
		expect(() => addViewTransition(plain)).toThrow('exactly once');
	});
});

describe('addReducedMotion', () => {
	test("gives examples/react-router's app.css its rule, once", async () => {
		const css = await Bun.file(
			join(ROOT, 'examples/react-router/app/app.css'),
		).text();
		expect(css.endsWith(REDUCED_MOTION)).toBe(true);
		expect(addReducedMotion(css.slice(0, -REDUCED_MOTION.length))).toBe(css);
		expect(addReducedMotion(css)).toBe(css);
	});
});

describe('atViewTransitionReact', () => {
	test('raises an older React and its types to 19.3.0, and keeps a newer one', () => {
		const manifest = atViewTransitionReact({
			scripts: {},
			dependencies: {
				react: '^19.2.8',
				'react-dom': '^19.3.1',
				isbot: '^5.1.36',
			},
			devDependencies: {
				'@types/react': '^19.2.18',
				'@types/react-dom': '^19.2.7',
			},
		});
		expect(manifest.dependencies).toEqual({
			react: '^19.3.0',
			'react-dom': '^19.3.1',
			isbot: '^5.1.36',
		});
		expect(manifest.devDependencies).toEqual({
			'@types/react': '^19.3.0',
			'@types/react-dom': '^19.3.0',
		});
	});
});
