import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { StepUpConfirmAnswer, StepUpRequestAnswer } from '../model';
import { asksStepUp, useStepUpReplay } from './use-step-up';

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

type Action = { intent: string; code?: string };
type Hook = ReturnType<typeof useStepUpReplay<Action>>;

const refused = { ok: false, stepUp: true } as const;
const granted = (via: 'email' | 'secondFactor'): StepUpRequestAnswer => ({
	ok: true,
	intent: 'request-step-up',
	challenge: 'c1',
	via,
});
const accepted: StepUpConfirmAnswer = { ok: true, intent: 'confirm-step-up' };

/** A page whose actions' answers the spec sets by hand. */
async function mount(action?: Action) {
	const posts: unknown[] = [];
	const replays: number[] = [];
	const state = {
		answer: undefined as unknown,
		request: undefined as StepUpRequestAnswer | undefined,
		confirm: undefined as StepUpConfirmAnswer | undefined,
	};
	let hook!: Hook;
	function Page() {
		hook = useStepUpReplay<Action>({
			answer: state.answer,
			replay: () => replays.push(1),
			action,
			spendsCode: (a) => a.code !== undefined,
			request: {
				post: () => posts.push('request'),
				answer: state.request,
				busy: false,
			},
			confirm: {
				post: (fields) => posts.push(fields),
				answer: state.confirm,
				busy: false,
			},
		});
		return null;
	}
	const root = createRoot(
		win.document.body.appendChild(
			win.document.createElement('div'),
		) as unknown as Element,
	);
	const rerender = () =>
		act(async () => {
			root.render(createElement(Page));
		});
	await rerender();
	return {
		posts,
		replays,
		state,
		rerender,
		get hook() {
			return hook;
		},
	};
}

describe('asksStepUp', () => {
	test('is a refusal carrying stepUp', () => {
		expect(asksStepUp({ ok: false, stepUp: { x: 1 } })).toBe(true);
		expect(asksStepUp({ ok: true, stepUp: true })).toBe(false);
		expect(asksStepUp({ ok: false })).toBe(false);
		expect(asksStepUp(undefined)).toBe(false);
	});
});

describe('useStepUpReplay', () => {
	test('a refusal opens the dialog and asks for a challenge; the code is posted; the action is replayed; its answer closes', async () => {
		const page = await mount({ intent: 'delete' });
		page.state.answer = refused;
		await page.rerender();
		expect(page.hook.open).toBe(true);
		expect(page.posts).toEqual(['request']);

		page.state.request = granted('email');
		await page.rerender();
		expect(page.hook.dialogProps.phase).toBe('code');
		act(() => page.hook.dialogProps.onSubmit('123456'));
		expect(page.posts.at(-1)).toEqual({
			challenge: 'c1',
			code: '123456',
			via: 'email',
		});

		page.state.confirm = accepted;
		await page.rerender();
		expect(page.replays).toHaveLength(1);
		expect(page.hook.open).toBe(true);
		expect(page.hook.dialogProps.confirming).toBe(true);

		page.state.answer = { ok: true };
		await page.rerender();
		expect(page.hook.open).toBe(false);
		expect(page.hook.confirmedNotice).toBe(false);
	});

	test('an action that carries a spent code is not replayed after a second-factor step-up', async () => {
		const page = await mount({ intent: 'disable', code: '654321' });
		page.state.answer = refused;
		page.state.request = granted('secondFactor');
		await page.rerender();
		act(() => page.hook.dialogProps.onSubmit('123456'));
		page.state.confirm = accepted;
		await page.rerender();
		expect(page.replays).toHaveLength(0);
		expect(page.hook.open).toBe(false);
		expect(page.hook.confirmedNotice).toBe(true);
	});

	test('the same action is replayed after a mailed step-up', async () => {
		const page = await mount({ intent: 'disable', code: '654321' });
		page.state.answer = refused;
		page.state.request = granted('email');
		await page.rerender();
		act(() => page.hook.dialogProps.onSubmit('123456'));
		page.state.confirm = accepted;
		await page.rerender();
		expect(page.replays).toHaveLength(1);
	});

	test('cancel closes without replaying', async () => {
		const page = await mount({ intent: 'delete' });
		page.state.answer = refused;
		await page.rerender();
		await act(async () => page.hook.cancel());
		expect(page.hook.open).toBe(false);
		expect(page.replays).toHaveLength(0);
	});
});
