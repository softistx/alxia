import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { CspNonceMeta, DocumentNonce, InlineScript } from './index';

const within = (
	nonce: string | undefined,
	child: ReturnType<typeof createElement>,
) => renderToString(createElement(DocumentNonce, { nonce }, child));

describe('InlineScript', () => {
	test('carries the document nonce', () => {
		expect(within('abc', createElement(InlineScript, { code: 'a()' }))).toBe(
			'<script nonce="abc">a()</script>',
		);
	});

	test('an explicit nonce wins over the document nonce', () => {
		expect(
			within('abc', createElement(InlineScript, { code: 'a()', nonce: 'own' })),
		).toBe('<script nonce="own">a()</script>');
	});

	test('renders no nonce attribute without a nonce', () => {
		expect(
			within(undefined, createElement(InlineScript, { code: 'a()' })),
		).toBe('<script>a()</script>');
		expect(renderToString(createElement(InlineScript, { code: 'a()' }))).toBe(
			'<script>a()</script>',
		);
	});

	test('does not escape the code', () => {
		const code = `if (a < 1 && b > "2") { document.documentElement.className = 'dark'; }`;
		expect(renderToString(createElement(InlineScript, { code }))).toBe(
			`<script>${code}</script>`,
		);
	});
});

describe('CspNonceMeta', () => {
	test('renders the csp-nonce meta with the document nonce', () => {
		expect(within('abc', createElement(CspNonceMeta))).toBe(
			'<meta property="csp-nonce" nonce="abc"/>',
		);
	});

	test('renders no nonce attribute without a nonce', () => {
		expect(renderToString(createElement(CspNonceMeta))).toBe(
			'<meta property="csp-nonce"/>',
		);
	});
});
