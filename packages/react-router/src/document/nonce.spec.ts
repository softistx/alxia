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

	type Found = { nonce: string } | null;
	/** A document answering each selector from `answers`; the selectors asked are returned. */
	const stub = (answers: Record<string, Found>) => {
		const selectors: string[] = [];
		g.document = {
			querySelector: (selector: string) => {
				selectors.push(selector);
				return answers[selector] ?? null;
			},
		};
		return selectors;
	};
	const HEAD = 'head script[nonce], head meta[property="csp-nonce"]';
	const ANY = 'script[nonce]';

	test('reads the nonce property of the first script[nonce], not the provider', async () => {
		const selectors = stub({ [HEAD]: { nonce: 'from-dom' } });
		const nonce = await load();
		expect(
			renderToString(
				createElement(nonce.DocumentNonce, { nonce: 'server' }, probe(nonce)),
			),
		).toBe('<script nonce="from-dom"></script>');
		expect(selectors).toEqual([HEAD]);
	});

	test('reads the document once and caches it', async () => {
		const selectors = stub({ [HEAD]: { nonce: 'once' } });
		const nonce = await load();
		renderToString(probe(nonce));
		renderToString(probe(nonce));
		expect(selectors).toHaveLength(1);
	});

	test('none when the document has no script[nonce]', async () => {
		stub({});
		const nonce = await load();
		expect(renderToString(probe(nonce))).toBe('<script></script>');
	});

	test('a script whose nonce is empty reads as none', async () => {
		stub({ [HEAD]: { nonce: '' } });
		const nonce = await load();
		expect(renderToString(probe(nonce))).toBe('<script></script>');
	});

	test('falls back to a script[nonce] outside the head', async () => {
		const selectors = stub({ [ANY]: { nonce: 'in-body' } });
		const nonce = await load();
		expect(renderToString(probe(nonce))).toBe(
			'<script nonce="in-body"></script>',
		);
		expect(selectors).toEqual([HEAD, ANY]);
	});

	test('the head wins over a later script, and a meta nonce is read the same way', async () => {
		stub({ [HEAD]: { nonce: 'from-meta' }, [ANY]: { nonce: 'in-body' } });
		const nonce = await load();
		expect(renderToString(probe(nonce))).toBe(
			'<script nonce="from-meta"></script>',
		);
	});
});

describe('the document context, one per process', () => {
	test("a second copy of the module provides to the first copy's useNonce", async () => {
		const first = await load();
		const second = await load();
		expect(second).not.toBe(first);
		expect(
			renderToString(
				createElement(second.DocumentNonce, { nonce: 'shared' }, probe(first)),
			),
		).toBe('<script nonce="shared"></script>');
	});

	test('the context sits under a versioned Symbol.for key', () => {
		const key = Symbol.for('@alxia/react-router:document-nonce@1');
		expect((globalThis as Record<symbol, unknown>)[key]).toBeDefined();
	});
});
