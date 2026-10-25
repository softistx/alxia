import { afterEach, describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

type Nonce = typeof import('./nonce');

/** A fresh copy of the module: its browser cache starts empty. */
let copies = 0;
const load = () => import(`./nonce?copy=${++copies}`) as Promise<Nonce>;

const probe = ({ useNonce }: Nonce) =>
	createElement(() => createElement('script', { nonce: useNonce() }));

describe('useNonce, on the server', () => {
	test('reads the response nonce from DocumentNonce, with no router nor loader data', async () => {
		const nonce = await load();
		expect(
			renderToString(
				createElement(nonce.DocumentNonce, { nonce: 'abc' }, probe(nonce)),
			),
		).toBe('<script nonce="abc"></script>');
	});

	test('none outside the provider', async () => {
		const nonce = await load();
		expect(renderToString(probe(nonce))).toBe('<script></script>');
	});

	test('none when the provider holds undefined', async () => {
		const nonce = await load();
		expect(
			renderToString(
				createElement(nonce.DocumentNonce, { nonce: undefined }, probe(nonce)),
			),
		).toBe('<script></script>');
	});
});

describe('useNonce, in the browser', () => {
	const g = globalThis as { document?: unknown };
	const original = g.document;
	afterEach(() => {
		if (original === undefined) delete g.document;
		else g.document = original;
	});

	const stub = (script: { nonce: string } | null) => {
		const selectors: string[] = [];
		g.document = {
			querySelector: (selector: string) => {
				selectors.push(selector);
				return script;
			},
		};
		return selectors;
	};

	test('reads the nonce property of the first script[nonce], not the provider', async () => {
		const selectors = stub({ nonce: 'from-dom' });
		const nonce = await load();
		expect(
			renderToString(
				createElement(nonce.DocumentNonce, { nonce: 'server' }, probe(nonce)),
			),
		).toBe('<script nonce="from-dom"></script>');
		expect(selectors).toEqual(['script[nonce]']);
	});

	test('reads the document once and caches it', async () => {
		const selectors = stub({ nonce: 'once' });
		const nonce = await load();
		renderToString(probe(nonce));
		renderToString(probe(nonce));
		expect(selectors).toHaveLength(1);
	});

	test('none when the document has no script[nonce]', async () => {
		stub(null);
		const nonce = await load();
		expect(renderToString(probe(nonce))).toBe('<script></script>');
	});

	test('a script whose nonce is empty reads as none', async () => {
		stub({ nonce: '' });
		const nonce = await load();
		expect(renderToString(probe(nonce))).toBe('<script></script>');
	});
});
