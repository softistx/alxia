import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { type AnswerSource, useFetcherAnswer } from './use-fetcher-answer';

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
	ok: boolean;
	n: number;
}

/** Renders the hook with a fetcher the spec changes between renders. */
function harness(onAnswer?: (answer: Answer) => void) {
	const seen: Array<Answer | undefined> = [];
	let source: AnswerSource<Answer> = { state: 'idle', data: undefined };
	const Probe = () => {
		seen.push(useFetcherAnswer(source, onAnswer));
		return null;
	};
	const root = createRoot(
		win.document.createElement('div') as unknown as Element,
	);
	const render = async (next?: AnswerSource<Answer>) => {
		if (next) source = next;
		await act(async () => {
			root.render(createElement(Probe));
		});
	};
	return { render, seen, root };
}

describe('useFetcherAnswer', () => {
	test('calls the handler once per new answer while idle, and returns it', async () => {
		const calls: Answer[] = [];
		const { render, seen } = harness((answer) => calls.push(answer));
		await render();
		const first = { ok: true, n: 1 };
		await render({ state: 'submitting', data: first });
		expect(calls).toEqual([]);
		await render({ state: 'idle', data: first });
		await render({ state: 'idle', data: first });
		expect(calls).toEqual([first]);
		expect(seen.at(-1)).toBe(first);
		const second = { ok: false, n: 2 };
		await render({ state: 'idle', data: second });
		expect(calls).toEqual([first, second]);
		expect(seen.at(-1)).toBe(second);
	});

	test('ignores the data present at mount: an earlier visit is not new', async () => {
		const calls: Answer[] = [];
		const old = { ok: true, n: 0 };
		const { seen, root } = harness((answer) => calls.push(answer));
		const Probe = () => {
			seen.push(
				useFetcherAnswer({ state: 'idle', data: old }, (a) => calls.push(a)),
			);
			return null;
		};
		await act(async () => {
			root.render(createElement(Probe));
		});
		expect(calls).toEqual([]);
		expect(seen.at(-1)).toBeUndefined();
	});

	test('hands over an answer arriving as a new object even when equal in value', async () => {
		const calls: Answer[] = [];
		const { render } = harness((answer) => calls.push(answer));
		await render();
		await render({ state: 'idle', data: { ok: true, n: 1 } });
		await render({ state: 'idle', data: { ok: true, n: 1 } });
		expect(calls).toHaveLength(2);
	});

	test('reads the latest handler without firing again when it changes', async () => {
		const calls: string[] = [];
		const seenState = { state: 'idle', data: undefined as Answer | undefined };
		const Probe = ({ tag }: { tag: string }) => {
			useFetcherAnswer(seenState, () => calls.push(tag));
			return null;
		};
		const root = createRoot(
			win.document.createElement('div') as unknown as Element,
		);
		await act(async () => root.render(createElement(Probe, { tag: 'a' })));
		seenState.data = { ok: true, n: 1 };
		await act(async () => root.render(createElement(Probe, { tag: 'b' })));
		await act(async () => root.render(createElement(Probe, { tag: 'c' })));
		expect(calls).toEqual(['b']);
	});

	test('works without a handler and renders on the server', () => {
		const Probe = () =>
			createElement(
				'p',
				null,
				String(useFetcherAnswer({ state: 'idle', data: { ok: true, n: 1 } })),
			);
		expect(renderToString(createElement(Probe))).toContain('undefined');
	});
});
