import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RouterLink, type RouterLinkProps } from './router-link';

const globals = globalThis as Record<string, unknown>;

function render(props: RouterLinkProps): string {
	const router = createMemoryRouter(
		[{ path: '/', element: createElement(RouterLink, props) }],
		{ initialEntries: ['/'] },
	);
	return renderToString(createElement(RouterProvider, { router }));
}

describe('RouterLink', () => {
	test('renders an anchor to href with className, children and anchor props', () => {
		const html = render({
			href: '/courses?x=1',
			className: 'btn',
			children: 'Courses',
			'aria-label': 'All courses',
			target: '_blank',
		});
		expect(html).toContain('<a ');
		expect(html).toContain('href="/courses?x=1"');
		expect(html).toContain('class="btn"');
		expect(html).toContain('aria-label="All courses"');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('>Courses</a>');
	});

	test('takes to as the destination too', () => {
		const html = render({
			to: { pathname: '/a', search: '?b=1' },
			children: 'A',
		});
		expect(html).toContain('href="/a?b=1"');
	});

	test('renders absolute, mailto and protocol-relative targets as a plain anchor', () => {
		for (const href of [
			'https://example.org/a?b=1',
			'mailto:a@b.test',
			'//cdn.test/x',
		]) {
			expect(render({ href, children: 'X' })).toContain(`href="${href}"`);
		}
	});

	test("passes React Router link props on: reloadDocument is Link's own prop", () => {
		// With reloadDocument Link leaves navigation to the browser; its anchor
		// still renders, and the prop is not forwarded to the DOM.
		const html = render({ href: '/x', reloadDocument: true, children: 'X' });
		expect(html).toContain('href="/x"');
		expect(html).not.toContain('reloadDocument');
		expect(html).not.toContain('reloaddocument');
	});

	test('gives a ref the anchor', async () => {
		const ref = createRef<HTMLAnchorElement>();
		const win = new Window({ url: 'https://app.test/' });
		const keys = ['window', 'document', 'navigator', 'HTMLElement', 'Node'];
		const saved = keys.map((key) => [key, globals[key]] as const);
		for (const key of keys) {
			Object.defineProperty(globals, key, {
				value: (win as unknown as Record<string, unknown>)[key],
				configurable: true,
				writable: true,
			});
		}
		const container = win.document.createElement('div');
		win.document.body.appendChild(container);
		const router = createMemoryRouter(
			[
				{
					path: '/',
					element: createElement(RouterLink, {
						href: '/x',
						ref,
						children: 'X',
					}),
				},
			],
			{ initialEntries: ['/'] },
		);
		const before = globals['IS_REACT_ACT_ENVIRONMENT'];
		globals['IS_REACT_ACT_ENVIRONMENT'] = true;
		const root = createRoot(container as unknown as Element);
		await act(async () => {
			root.render(createElement(RouterProvider, { router }));
		});
		expect(ref.current?.tagName).toBe('A');
		expect(ref.current?.getAttribute('href')).toBe('/x');
		await act(async () => root.unmount());
		globals['IS_REACT_ACT_ENVIRONMENT'] = before;
		for (const [key, value] of saved) {
			Object.defineProperty(globals, key, {
				value,
				configurable: true,
				writable: true,
			});
		}
		await win.happyDOM.close();
	});
});
