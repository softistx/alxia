import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider } from 'react-router';
import {
	type DebouncedFetcher,
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

const DELAY = 15;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A router with a page using the hook and a resource route that answers `?q=`. */
function harness(
	options: Parameters<typeof useDebouncedFetcher>[2] = {},
	answerMs = 0,
) {
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
		const h = harness({ delayMs: 500 });
		await h.type('one');
		await act(async () => h.last().retry());
		await act(async () => sleep(20));
		expect(h.asked).toEqual(['one']);
		expect(h.last()).toMatchObject({ state: 'done', data: { q: 'one' } });
		await act(async () => h.last().retry());
		await act(async () => sleep(20));
		expect(h.asked).toEqual(['one', 'one']);
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
