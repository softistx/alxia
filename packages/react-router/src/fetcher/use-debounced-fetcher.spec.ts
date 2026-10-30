import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
	type DebouncedFetcher,
	type DebouncedFetcherOptions,
	useDebouncedFetcher,
} from './use-debounced-fetcher';

const globals = globalThis as Record<string, unknown>;
const KEYS = ['window', 'document', 'navigator', 'HTMLElement', 'Node'];
const saved = new Map<string, unknown>();
let win: Window;

beforeAll(() => {
	win = new Window({ url: 'https://app.test/' });
	for (const key of KEYS) {
		saved.set(key, globals[key]);
		Object.defineProperty(globals, key, {
			value: (win as unknown as Record<string, unknown>)[key],
			configurable: true,
			writable: true,
		});
	}
	globals['IS_REACT_ACT_ENVIRONMENT'] = true;
});

afterAll(() => {
	for (const key of KEYS) {
		Object.defineProperty(globals, key, {
			value: saved.get(key),
			configurable: true,
			writable: true,
		});
	}
	globals['IS_REACT_ACT_ENVIRONMENT'] = undefined;
});

interface Answer {
	q: string;
}

const roots: Array<ReturnType<typeof createRoot>> = [];
afterEach(async () => {
	for (const r of roots) await act(async () => r.unmount());
	roots.length = 0;
});

const DELAY = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A router with a page using the hook and a resource route that answers `?q=`. */
function harness(options: DebouncedFetcherOptions<Answer> = {}, answerMs = 0) {
	const asked: string[] = [];
	const seen: Array<DebouncedFetcher<Answer>> = [];
	let setTyped: (value: string) => void = () => {};
	const Page = () => {
		const [typed, set] = useState('');
		setTyped = set;
		const result = useDebouncedFetcher<Answer>(
			typed,
			(q) => `/suggest?q=${encodeURIComponent(q)}`,
			{ delayMs: DELAY, ...options },
		);
		seen.push(result);
		return null;
	};
	const router = createMemoryRouter(
		[
			{ path: '/', Component: Page },
			{
				path: '/suggest',
				loader: async ({ request }) => {
					const q = new URL(request.url).searchParams.get('q') ?? '';
					asked.push(q);
					if (answerMs) await sleep(answerMs);
					return { q };
				},
			},
		],
		{ initialEntries: ['/'] },
	);
	const root = createRoot(
		win.document.createElement('div') as unknown as Element,
	);
	roots.push(root);
	let rendered = false;
	const render = async () => {
		rendered = true;
		await act(async () => {
			root.render(createElement(RouterProvider, { router }));
		});
	};
	const type = async (next: string, wait = 0) => {
		if (!rendered) await render();
		await act(async () => setTyped(next));
		if (wait) await act(async () => sleep(wait));
	};
	const last = () => seen[seen.length - 1] as DebouncedFetcher<Answer>;
	return { type, last, asked, render };
}

describe('useDebouncedFetcher', () => {
	test('asks once, after the pause, and answers for the value', async () => {
		const h = harness();
		await h.render();
		expect(h.last().state).toBe('idle');
		await h.type('a');
		await h.type('ab');
		await h.type('abc');
		expect(h.last().state).toBe('waiting');
		expect(h.asked).toEqual([]);
		await act(async () => sleep(DELAY * 4));
		expect(h.asked).toEqual(['abc']);
		expect(h.last()).toMatchObject({
			state: 'done',
			stale: false,
			data: { q: 'abc' },
		});
	});

	test('asks nothing below minLength and trims the value', async () => {
		const h = harness({ minLength: 3 });
		await h.type('  ab ', DELAY * 3);
		expect(h.asked).toEqual([]);
		expect(h.last()).toMatchObject({ state: 'idle', data: undefined });
		await h.type(' abc ', DELAY * 4);
		expect(h.asked).toEqual(['abc']);
	});

	test('keeps the previous answer, stale, while the next waits and loads', async () => {
		const h = harness({}, 30);
		await h.type('one', DELAY + 60);
		expect(h.last().data).toEqual({ q: 'one' });
		await h.type('two');
		expect(h.last()).toMatchObject({
			state: 'waiting',
			stale: true,
			data: { q: 'one' },
		});
		await act(async () => sleep(DELAY + 5));
		expect(h.last()).toMatchObject({ state: 'loading', stale: true });
		await act(async () => sleep(80));
		expect(h.last()).toMatchObject({
			state: 'done',
			stale: false,
			data: { q: 'two' },
		});
	});

	test('never returns an answer for an older value as current', async () => {
		const h = harness({}, 0);
		await h.type('one', DELAY * 4);
		await h.type('two');
		expect(h.last().data).toEqual({ q: 'one' });
		expect(h.last().stale).toBe(true);
	});

	test('goes idle and forgets the answer when the value empties or it is disabled', async () => {
		const h = harness();
		await h.type('one', DELAY * 4);
		await h.type('');
		expect(h.last()).toMatchObject({ state: 'idle', data: undefined });
		await h.type('two', DELAY * 4);
		expect(h.last().data).toEqual({ q: 'two' });
	});

	test('retry asks again for the value as it stands, without the pause', async () => {
		const h = harness({ delayMs: 300 });
		await h.type('one');
		expect(h.asked).toEqual([]);
		await act(async () => h.last().retry());
		await act(async () => sleep(20));
		expect(h.asked).toEqual(['one']);
		expect(h.last()).toMatchObject({ state: 'done', data: { q: 'one' } });
		await act(async () => h.last().retry());
		await act(async () => sleep(20));
		expect(h.asked).toEqual(['one', 'one']);
	});

	test('unmounting before the pause loads nothing', async () => {
		const h = harness();
		await h.type('one');
		await act(async () => roots[roots.length - 1]?.unmount());
		await act(async () => sleep(DELAY * 3));
		expect(h.asked).toEqual([]);
	});

	test('enabled: false asks nothing and forgets the answer', async () => {
		let on = true;
		const h = harness({
			get enabled() {
				return on;
			},
		});
		await h.type('one', DELAY * 4);
		expect(h.last().data).toEqual({ q: 'one' });
		on = false;
		await h.type('one!');
		expect(h.last()).toMatchObject({ state: 'idle', data: undefined });
		await act(async () => sleep(DELAY * 3));
		expect(h.asked).toEqual(['one']);
	});

	test('a custom key still answers', async () => {
		const h = harness({ key: 'typeahead' });
		await h.type('one', DELAY * 4);
		expect(h.last()).toMatchObject({ state: 'done', data: { q: 'one' } });
	});

	test('a newer value while loading keeps the older answer stale, then answers the newer', async () => {
		const h = harness({}, 40);
		await h.type('one', DELAY + 80);
		await h.type('two', DELAY + 10);
		expect(h.last()).toMatchObject({ state: 'loading', data: { q: 'one' } });
		await h.type('three', DELAY + 10);
		expect(h.last()).toMatchObject({ stale: true, data: { q: 'one' } });
		await act(async () => sleep(120));
		expect(h.last()).toMatchObject({ state: 'done', data: { q: 'three' } });
	});

	test('retry while idle asks nothing, and retry is stable', async () => {
		const h = harness();
		await h.render();
		const first = h.last().retry;
		await act(async () => first());
		await act(async () => sleep(DELAY * 2));
		expect(h.asked).toEqual([]);
		await h.type('one', DELAY * 4);
		expect(h.last().retry).toBe(first);
	});

	test('keep decides which answers may stay as the previous one', async () => {
		const h = harness({ keep: (a) => a.q !== 'bad' });
		await h.type('good', DELAY * 4);
		await h.type('bad', DELAY * 4);
		expect(h.last()).toMatchObject({ state: 'done', data: { q: 'bad' } });
		await h.type('next');
		expect(h.last()).toMatchObject({ stale: true, data: { q: 'good' } });
	});

	test('a string target is loaded as it is', async () => {
		let setTyped: (v: string) => void = () => {};
		const asked: string[] = [];
		const Page = () => {
			const [v, set] = useState('');
			setTyped = set;
			useDebouncedFetcher<Answer>(v, '/fixed?x=1', { delayMs: DELAY });
			return null;
		};
		const router = createMemoryRouter([
			{ path: '/', Component: Page },
			{
				path: '/fixed',
				loader: ({ request }) => {
					asked.push(new URL(request.url).search);
					return { q: 'x' };
				},
			},
		]);
		const root = createRoot(
			win.document.createElement('div') as unknown as Element,
		);
		roots.push(root);
		await act(async () =>
			root.render(createElement(RouterProvider, { router })),
		);
		await act(async () => setTyped('abc'));
		await act(async () => sleep(DELAY * 4));
		expect(asked).toEqual(['?x=1']);
	});

	test('never reports the previous answer as done/current while the next load starts', async () => {
		const frames: Array<{
			state: string;
			stale: boolean;
			q: string | undefined;
		}> = [];
		let setTyped: (value: string) => void = () => {};
		let calls = 0;
		const Page = () => {
			const [typed, set] = useState('');
			setTyped = set;
			const r = useDebouncedFetcher<Answer>(
				typed,
				(q) => `/suggest?q=${encodeURIComponent(q)}`,
				{ delayMs: DELAY },
			);
			frames.push({ state: r.state, stale: r.stale, q: r.data?.q });
			return null;
		};
		const router = createMemoryRouter(
			[
				{ path: '/', Component: Page },
				{
					path: '/suggest',
					loader: ({ request }) => {
						calls += 1;
						const q = new URL(request.url).searchParams.get('q') ?? '';
						// The second answer never lands.
						return calls === 1 ? { q } : new Promise<Answer>(() => {});
					},
				},
			],
			{ initialEntries: ['/'] },
		);
		const root = createRoot(
			win.document.createElement('div') as unknown as Element,
		);
		roots.push(root);
		await act(async () =>
			root.render(createElement(RouterProvider, { router })),
		);
		await act(async () => setTyped('ab'));
		await act(async () => sleep(DELAY * 4));
		expect(frames[frames.length - 1]).toEqual({
			state: 'done',
			stale: false,
			q: 'ab',
		});
		const from = frames.length;
		await act(async () => setTyped('abc'));
		await act(async () => sleep(DELAY * 4));
		const after = frames.slice(from);
		expect(after.some((f) => f.state === 'loading')).toBe(true);
		expect(
			after.filter((f) => f.state === 'done' || f.stale === false),
		).toEqual([]);
		expect(after[after.length - 1]).toEqual({
			state: 'loading',
			stale: true,
			q: 'ab',
		});
	});

	test('renders without loading on the server (waiting, no data)', () => {
		let result: DebouncedFetcher<Answer> | undefined;
		const router = createMemoryRouter([
			{
				path: '/',
				Component: () => {
					result = useDebouncedFetcher<Answer>('abc', '/suggest');
					return null;
				},
			},
		]);
		renderToString(createElement(RouterProvider, { router }));
		expect(result?.state).toBe('waiting');
		expect(result?.data).toBeUndefined();
	});
});
