import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { createMemoryRouter, RouterProvider, redirect } from 'react-router';
import { z } from 'zod';
import { useCodeField } from './use-code-field';
import { useLinkParam } from './use-link-param';
import { signOutAfter, useSignOut } from './use-sign-out';

// A DOM for the specs of this file only: set on `globalThis` for its
// duration, put back after, so the other specs never see it.
const globals = globalThis as Record<string, unknown>;
const KEYS = ['window', 'document', 'navigator', 'HTMLElement', 'Node'];
const saved = new Map<string, unknown>();
let win: Window;

beforeAll(() => {
	win = new Window({ url: 'https://app.test/reset?token=abc&keep=1#h' });
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

type SignOutAction = (args: { request: Request }) => unknown;

async function mount(
	element: ReactNode,
	{
		path = '/reset?token=abc&keep=1',
		signOut = (() => null) as SignOutAction,
	} = {},
) {
	const router = createMemoryRouter(
		[
			{ path: '/reset', element },
			{ path: '/sign-out', action: signOut },
		],
		{ initialEntries: [path] },
	);
	const container = win.document.createElement('div');
	win.document.body.appendChild(container);
	const root = createRoot(container as unknown as Element);
	await act(async () => {
		root.render(createElement(RouterProvider, { router }));
	});
	return { container, root };
}

type Probe<T> = { current?: T };
const code6 = z.string().regex(/^\d{6}$/, 'six digits');

describe('useLinkParam', () => {
	test('reads the parameter, and leaves the address bar alone by default', async () => {
		let seen: string | null | undefined;
		function Page() {
			seen = useLinkParam('token');
			return null;
		}
		win.happyDOM.setURL('https://app.test/reset?token=abc&keep=1#h');
		await mount(createElement(Page));
		expect(seen).toBe('abc');
		expect(win.location.search).toBe('?token=abc&keep=1');
	});

	test('drop removes only that parameter from the address bar; the value, the history state and the hash stay', async () => {
		let seen: string | null | undefined;
		function Page() {
			seen = useLinkParam('token', { drop: true });
			return null;
		}
		win.happyDOM.setURL('https://app.test/reset?token=abc&keep=1#h');
		win.history.replaceState({ k: 1 }, '', win.location.href);
		await mount(createElement(Page));
		expect(seen).toBe('abc');
		expect(win.location.search).toBe('?keep=1');
		expect(win.location.hash).toBe('#h');
		expect(win.history.state).toEqual({ k: 1 });
	});

	test('absent or empty is null', async () => {
		const seen: Array<string | null> = [];
		function Page() {
			seen.push(useLinkParam('token'));
			return null;
		}
		await mount(createElement(Page), { path: '/reset?token=' });
		expect(seen.at(-1)).toBeNull();
	});

	test('renders on the server', () => {
		function Page() {
			return createElement(
				'p',
				null,
				String(useLinkParam('token', { drop: true })),
			);
		}
		const router = createMemoryRouter(
			[{ path: '/reset', element: createElement(Page) }],
			{ initialEntries: ['/reset?token=abc'] },
		);
		expect(renderToString(createElement(RouterProvider, { router }))).toContain(
			'abc',
		);
	});
});

describe('useCodeField', () => {
	function Field({
		refusal,
		probe,
	}: {
		refusal?: object | undefined;
		probe: Probe<ReturnType<typeof useCodeField>>;
	}) {
		const field = useCodeField(code6, refusal);
		probe.current = field;
		return createElement('input', {
			ref: field.ref,
			value: field.code,
			onChange: (e: { target: { value: string } }) =>
				field.setCode(e.target.value),
		});
	}

	test('check returns the parsed value, or sets the first message until the next keystroke', async () => {
		const probe: Probe<ReturnType<typeof useCodeField>> = {};
		const { root } = await mount(createElement(Field, { probe }));
		await act(async () => probe.current?.setCode('12'));
		let out: unknown = 'unset';
		await act(async () => {
			out = probe.current?.check();
		});
		expect(out).toBeUndefined();
		expect(probe.current?.error).toBe('six digits');
		await act(async () => probe.current?.setCode('123456'));
		expect(probe.current?.error).toBeUndefined();
		await act(async () => {
			out = probe.current?.check();
		});
		expect(out).toBe('123456');
		root.unmount();
	});

	test('each new refusal clears the code and focuses the input; one there at mount does not', async () => {
		const probe: Probe<ReturnType<typeof useCodeField>> = {};
		const first = {};
		const container = win.document.createElement('div');
		win.document.body.appendChild(container);
		const root = createRoot(container as unknown as Element);
		const render = (refusal?: object) =>
			act(async () => {
				root.render(createElement(Field, { refusal, probe }));
			});
		await render(first);
		await act(async () => probe.current?.setCode('999999'));
		await render(first);
		expect(probe.current?.code).toBe('999999');
		await render({});
		expect(probe.current?.code).toBe('');
		expect(
			win.document.activeElement === container.querySelector('input'),
		).toBe(true);
		await act(async () => probe.current?.setCode('111111'));
		await render({});
		expect(probe.current?.code).toBe('');
		root.unmount();
	});

	test('an asynchronous schema is refused', async () => {
		const probe: Probe<ReturnType<typeof useCodeField>> = {};
		const asyncSchema = {
			'~standard': { validate: async () => ({ value: 1 }) },
		};
		function Page() {
			probe.current = useCodeField(asyncSchema, undefined);
			return null;
		}
		await mount(createElement(Page));
		expect(() => probe.current?.check()).toThrow(TypeError);
	});
});

describe('signOutAfter', () => {
	test('submits after before() settles, and even when it rejects', async () => {
		const order: string[] = [];
		await signOutAfter(
			async () => {
				order.push('before');
				throw new Error('SecurityError');
			},
			() => {
				order.push('submit');
			},
		);
		expect(order).toEqual(['before', 'submit']);
	});
});

describe('useSignOut', () => {
	test('posts {} as JSON to /sign-out after before(), busy meanwhile', async () => {
		const bodies: unknown[] = [];
		const types: Array<string | null> = [];
		const order: string[] = [];
		const probe: Probe<ReturnType<typeof useSignOut>> = {};
		function Page() {
			probe.current = useSignOut({
				before: () => {
					order.push('before');
				},
			});
			return null;
		}
		await mount(createElement(Page), {
			signOut: async ({ request }) => {
				order.push('post');
				types.push(request.headers.get('content-type'));
				bodies.push(await request.json());
				return redirect('/reset');
			},
		});
		expect(probe.current?.busy).toBe(false);
		await act(async () => {
			probe.current?.signOut();
		});
		for (let i = 0; i < 20 && probe.current?.busy; i++) {
			await act(async () => {
				await new Promise((resolve) => setTimeout(resolve, 25));
			});
		}
		expect(order).toEqual(['before', 'post']);
		expect(bodies).toEqual([{}]);
		expect(types[0]).toContain('application/json');
		expect(probe.current?.busy).toBe(false);
	});
});
