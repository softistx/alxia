import { expect, test } from 'bun:test';
import { createLanguageStore } from './language-store';

test('the snapshot is undefined until a pick, then the picked language', () => {
	const store = createLanguageStore<'en' | 'fr'>();
	expect(store.getSnapshot()).toBeUndefined();
	store.choose('fr');
	expect(store.getSnapshot()).toBe('fr');
});

test('listeners are called on each pick', () => {
	const store = createLanguageStore<'en' | 'fr'>();
	let calls = 0;
	store.subscribe(() => {
		calls++;
	});
	store.choose('fr');
	store.choose('en');
	expect(calls).toBe(2);
});

test('unsubscribe stops the listener', () => {
	const store = createLanguageStore<'en' | 'fr'>();
	let calls = 0;
	const unsubscribe = store.subscribe(() => {
		calls++;
	});
	store.choose('fr');
	unsubscribe();
	store.choose('en');
	expect(calls).toBe(1);
});

test('two stores do not share listeners or picks', () => {
	const a = createLanguageStore<'en' | 'fr'>();
	const b = createLanguageStore<'en' | 'fr'>();
	let calls = 0;
	b.subscribe(() => {
		calls++;
	});
	a.choose('fr');
	expect(calls).toBe(0);
	expect(b.getSnapshot()).toBeUndefined();
});
