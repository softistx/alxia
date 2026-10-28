import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { RouterLink, type RouterLinkProps } from './router-link';

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

	test('passes React Router link props on', () => {
		const html = render({ href: '/x', reloadDocument: true, children: 'X' });
		expect(html).toContain('href="/x"');
	});
});
