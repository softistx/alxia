import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { INITIAL_STEP_UP, stepUpReducer } from '../../model/step-up';
import type {
	StepUpConfirmAnswer,
	StepUpRequestAnswer,
} from '../../model/step-up-answers';
import { confirmAnswerOf, requestAnswerOf } from './answers';
import { asksStepUp, stepUpDialogPhase } from './phase';
import { useStepUpReplay } from './use-step-up-replay';

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
		action,
		answer: undefined as unknown,
		request: undefined as StepUpRequestAnswer | undefined,
		confirm: undefined as StepUpConfirmAnswer | undefined,
	};
	let hook!: Hook;
	function Page() {
		hook = useStepUpReplay<Action>({
			answer: state.answer,
			replay: () => replays.push(1),
			action: state.action,
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
		await page.rerender();
		page.state.request = granted('secondFactor');
		await page.rerender();
		act(() => page.hook.dialogProps.onSubmit('123456'));
		page.state.confirm = accepted;
		await page.rerender();
		expect(page.replays).toHaveLength(0);
		expect(page.hook.open).toBe(false);
		expect(page.hook.confirmedNotice).toBe(true);
	});

	test('confirmedNotice clears as soon as a new action is posted, before its answer', async () => {
		const page = await mount({ intent: 'disable', code: '654321' });
		page.state.answer = refused;
		await page.rerender();
		page.state.request = granted('secondFactor');
		await page.rerender();
		act(() => page.hook.dialogProps.onSubmit('123456'));
		page.state.confirm = accepted;
		await page.rerender();
		expect(page.hook.confirmedNotice).toBe(true);
		await page.rerender();
		expect(page.hook.confirmedNotice).toBe(true);

		page.state.action = { intent: 'disable', code: '111111' };
		await page.rerender();
		expect(page.hook.confirmedNotice).toBe(false);
	});

	test('the same action is replayed after a mailed step-up', async () => {
		const page = await mount({ intent: 'disable', code: '654321' });
		page.state.answer = refused;
		await page.rerender();
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

	test('a code accepted after cancel replays nothing', async () => {
		const page = await mount({ intent: 'delete' });
		page.state.answer = refused;
		await page.rerender();
		page.state.request = granted('email');
		await page.rerender();
		act(() => page.hook.dialogProps.onSubmit('123456'));
		await act(async () => page.hook.cancel());
		page.state.confirm = accepted;
		await page.rerender();
		expect(page.replays).toHaveLength(0);
		expect(page.hook.open).toBe(false);
	});

	test('a challenge granted after cancel is forgotten: the next step-up asks again', async () => {
		const page = await mount({ intent: 'delete' });
		page.state.answer = refused;
		await page.rerender();
		await act(async () => page.hook.cancel());
		page.state.request = granted('email');
		await page.rerender();
		page.state.answer = { ok: false, stepUp: true };
		await page.rerender();
		expect(page.hook.open).toBe(true);
		expect(page.hook.dialogProps.phase).toBe('asking');
		expect(page.posts.filter((p) => p === 'request')).toHaveLength(2);
	});

	test('a replayed action refused for a step-up again reopens the step-up', async () => {
		const page = await mount({ intent: 'delete' });
		page.state.answer = refused;
		await page.rerender();
		page.state.request = granted('email');
		await page.rerender();
		act(() => page.hook.dialogProps.onSubmit('123456'));
		page.state.confirm = accepted;
		await page.rerender();
		page.state.answer = { ok: false, stepUp: true };
		await page.rerender();
		expect(page.hook.open).toBe(true);
		expect(page.posts.filter((p) => p === 'request')).toHaveLength(2);
	});

	test('"Resend code" exists for a mailed code only', async () => {
		const mailed = await mount();
		mailed.state.answer = refused;
		await mailed.rerender();
		mailed.state.request = granted('email');
		await mailed.rerender();
		expect(mailed.hook.dialogProps.onResend).toBeDefined();
		const app = await mount();
		app.state.answer = refused;
		await app.rerender();
		app.state.request = granted('secondFactor');
		await app.rerender();
		expect(app.hook.dialogProps.onResend).toBeUndefined();
	});

	test('the dialog keeps the via in every phase once a challenge was granted', async () => {
		const page = await mount();
		page.state.answer = refused;
		await page.rerender();
		expect(page.hook.dialogProps.via).toBeUndefined();
		page.state.request = granted('email');
		await page.rerender();
		expect(page.hook.dialogProps.phase).toBe('code');
		expect(page.hook.dialogProps.via).toBe('email');

		act(() => page.hook.dialogProps.onSubmit('123456'));
		page.state.confirm = {
			ok: false,
			intent: 'confirm-step-up',
			error: 'expired',
		} as StepUpConfirmAnswer;
		await page.rerender();
		expect(page.hook.dialogProps.phase).toBe('expired');
		expect(page.hook.dialogProps.via).toBe('email');

		act(() => page.hook.dialogProps.onRetry());
		page.state.request = {
			ok: false,
			intent: 'request-step-up',
			error: 'failed',
		} as StepUpRequestAnswer;
		await page.rerender();
		expect(page.hook.dialogProps.phase).toBe('failed');
		expect(page.hook.dialogProps.via).toBe('email');
	});

	test('each channel keeps the fields of its own post', () => {
		const channel = {
			answer: undefined,
			busy: false,
		};
		void (() =>
			useStepUpReplay<Action>({
				answer: undefined,
				replay() {},
				request: {
					...channel,
					// @ts-expect-error the request takes no field
					post: (fields: { challenge: string }) => void fields,
				},
				confirm: {
					...channel,
					// @ts-expect-error the confirm posts a challenge, a code and a via
					post: (fields: { code: number }) => void fields,
				},
			}));
	});
});

describe('stepUpDialogPhase', () => {
	const asked = stepUpReducer(INITIAL_STEP_UP, { type: 'start' });
	test('asking, code, failed, expired and confirmed', () => {
		expect(stepUpDialogPhase(INITIAL_STEP_UP)).toBe('asking');
		const code = stepUpReducer(asked, {
			type: 'requested',
			answer: granted('email'),
		});
		expect(stepUpDialogPhase(code)).toBe('code');
		const failed = stepUpReducer(asked, {
			type: 'requested',
			answer: { ok: false, intent: 'request-step-up', error: 'failed' },
		});
		expect(stepUpDialogPhase(failed)).toBe('failed');
		const expired = stepUpReducer(code, {
			type: 'confirmed',
			answer: {
				ok: false,
				intent: 'confirm-step-up',
				error: 'expired',
				locked: false,
			},
		});
		expect(stepUpDialogPhase(expired)).toBe('expired');
		expect(
			stepUpDialogPhase(
				stepUpReducer(code, { type: 'confirmed', answer: accepted }),
			),
		).toBe('confirmed');
	});
});

describe('requestAnswerOf and confirmAnswerOf', () => {
	test('narrow the route’s union on the intent', () => {
		expect(requestAnswerOf(granted('email'))).toEqual(granted('email'));
		expect(requestAnswerOf(accepted)).toBeUndefined();
		expect(confirmAnswerOf(accepted)).toEqual(accepted);
		expect(confirmAnswerOf(granted('email'))).toBeUndefined();
		expect(confirmAnswerOf(undefined)).toBeUndefined();
	});
});
