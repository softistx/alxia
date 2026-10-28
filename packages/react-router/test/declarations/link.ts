// The /link exports: `href` or `to`, never both nor neither, and a `ref` that
// receives the anchor.

import { RouterLink, type RouterLinkProps } from '@alxia/react-router/link';
import { createElement, createRef } from 'react';

const ref = createRef<HTMLAnchorElement>();

export const withHref = createElement(RouterLink, { href: '/a', ref });
export const withTo = createElement(RouterLink, { to: { pathname: '/a' } });
export const props: RouterLinkProps = {
	href: '/a',
	className: 'x',
	replace: true,
};

// @ts-expect-error both destinations
export const both = createElement(RouterLink, { href: '/a', to: '/b' });
// @ts-expect-error no destination
export const neither = createElement(RouterLink, { className: 'x' });
