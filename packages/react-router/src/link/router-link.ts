import { createElement, type ReactElement } from 'react';
import { Link, type LinkProps, type To } from 'react-router';

/**
 * The props of {@link RouterLink}: React Router's `Link` props, with the
 * destination given as `href` (what a design system's link component hands
 * over) or as `to` (React Router's own name), never both.
 */
export type RouterLinkProps = Omit<LinkProps, 'to'> &
	({ href: To; to?: undefined } | { to: To; href?: undefined });

/**
 * React Router's `Link` for a UI library that renders its links through a
 * component of its own (a `LinkComponentProvider`): it receives `href` and
 * spreads every other prop (`className`, `children`, `aria-*`, `ref`, ...)
 * onto the anchor. Navigation stays client-side and `<Link>`'s own props
 * (`prefetch`, `replace`, `reloadDocument`, ...) still apply.
 *
 * ```tsx
 * <LinkComponentProvider component={RouterLink}>...</LinkComponentProvider>
 * ```
 */
export function RouterLink({
	href,
	to,
	...props
}: RouterLinkProps): ReactElement {
	return createElement(Link, { ...props, to: (href ?? to) as To });
}
