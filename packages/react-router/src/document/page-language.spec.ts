import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createPageLanguage } from './page-language';

const languages = ['en', 'fr'] as const;
function make(browser: boolean) {
	return createPageLanguage({
		languages,
		fallback: 'en',
		browser: () => browser,
	});
}

test('pageLanguage: the root language, else the fallback, on a server', () => {
	const { pageLanguage } = make(false);
	expect(pageLanguage('fr')).toBe('fr');
	expect(pageLanguage(undefined)).toBe('en');
	expect(pageLanguage('de')).toBe('en');
});

test('pageLanguage: a server remembers nothing', () => {
	const { pageLanguage } = make(false);
	pageLanguage('fr');
	expect(pageLanguage(undefined)).toBe('en');
});

test('pageLanguage: in a browser, the last language seen while the data is gone', () => {
	const { pageLanguage } = make(true);
	expect(pageLanguage('fr')).toBe('fr');
	expect(pageLanguage(undefined)).toBe('fr');
	expect(pageLanguage('en')).toBe('en');
	expect(pageLanguage(undefined)).toBe('en');
});

test('metaLanguage reads the root match, and the fallback with none', () => {
	const { metaLanguage } = make(false);
	expect(metaLanguage([{ loaderData: { language: 'fr' } }])).toBe('fr');
	expect(metaLanguage([])).toBe('en');
	expect(metaLanguage([{}])).toBe('en');
});

test('chooseLanguage wins in a browser, then stands in', () => {
	const { chooseLanguage, pageLanguage } = make(true);
	chooseLanguage('en');
	expect(pageLanguage('fr')).toBe('en');
	expect(pageLanguage(undefined)).toBe('en');
});

test('chooseLanguage never wins on a server', () => {
	const { chooseLanguage, pageLanguage } = make(false);
	chooseLanguage('en');
	expect(pageLanguage('fr')).toBe('fr');
});

test('instances do not share state', () => {
	const a = make(true);
	const b = make(true);
	a.chooseLanguage('fr');
	expect(b.pageLanguage(undefined)).toBe('en');
});

test('useChosenLanguage: the server render is always undefined, so hydration matches', () => {
	const { chooseLanguage, useChosenLanguage } = make(true);
	const Probe = () => createElement('p', null, String(useChosenLanguage()));
	chooseLanguage('fr');
	expect(renderToString(createElement(Probe))).toContain('undefined');
});

test('a fallback outside the languages throws', () => {
	expect(() =>
		createPageLanguage({
			languages: ['en', 'fr'] as readonly string[],
			fallback: 'de',
		}),
	).toThrow(
		new TypeError(
			'createPageLanguage(): the fallback "de" is not one of the languages; got ["en","fr"].',
		),
	);
});
