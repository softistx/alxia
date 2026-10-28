import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import {
	createMemoryRouter,
	createRoutesStub,
	RouterProvider,
	useLoaderData,
} from 'react-router';
import { orFailed } from './or-failed';
import { type PagedRows, usePagedRows } from './use-paged-rows';
import { useSameRouteLoading } from './use-same-route-loading';
import { useSearchChange } from './use-search-change';

// A DOM for this file's specs only, put back after (as session/react does).
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

interface Page {
	items: string[];
	next: string | null;
}

/** Three pages per search `q`: `<q>1,<q>2`, `<q>3,<q>4`, `<q>5`. */
function pageOf(url: URL): Page | null {
	const q = url.searchParams.get('q') ?? 'a';
	const after = url.searchParams.get('after');
	if (after === 'boom') return null;
	if (after === null) return { items: [`${q}1`, `${q}2`], next: 'p2' };
	if (after === 'p2') return { items: [`${q}3`, `${q}4`], next: 'p3' };
	return { items: [`${q}5`], next: null };
}

async function settle() {
	for (let i = 0; i < 5; i++)
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
		});
}

async function mount(
	Component: () => unknown,
	{
		path = '/rows',
		loader,
	}: { path?: string; loader?: (u: URL) => unknown } = {},
) {
	const router = createMemoryRouter(
		[
			{
				path: '/rows',
				loader: ({ request }) => {
					const url = new URL(request.url);
					return (loader ?? pageOf)(url);
				},
				element: createElement(Component as never),
				HydrateFallback: () => null,
			},
			{ path: '/other', loader: () => null, element: createElement('p') },
		],
		{ initialEntries: [path] },
	);
	const container = win.document.createElement('div');
	win.document.body.appendChild(container);
	const root = createRoot(container as unknown as Element);
	await act(async () => {
		root.render(createElement(RouterProvider, { router }));
	});
	await settle();
	return { router, container };
}

describe('usePagedRows', () => {
	test('the first page, then each page appended, up to the last', async () => {
		let paged: PagedRows<string> | undefined;
		function Rows() {
			paged = usePagedRows(useLoaderData() as Page, (p) => p.items);
			return null;
		}
		await mount(Rows);
		expect(paged?.rows).toEqual(['a1', 'a2']);
		expect(paged?.next).toBe('p2');
		await act(async () => paged?.loadMore());
		await settle();
		expect(paged?.rows).toEqual(['a1', 'a2', 'a3', 'a4']);
		await act(async () => paged?.loadMore());
		await settle();
		expect(paged?.rows).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
		expect(paged?.next).toBeNull();
		expect(paged?.loading).toBe(false);
		expect(paged?.error).toBe(false);
	});

	test('loading is true while a page is fetched, and the address bar stays', async () => {
		let paged: PagedRows<string> | undefined;
		const seen: boolean[] = [];
		function Rows() {
			paged = usePagedRows(useLoaderData() as Page, (p) => p.items);
			seen.push(paged.loading);
			return null;
		}
		const { router } = await mount(Rows, { path: '/rows?q=b' });
		await act(async () => paged?.loadMore());
		await settle();
		expect(seen).toContain(true);
		expect(router.state.location.search).toBe('?q=b');
		expect(paged?.rows).toEqual(['b1', 'b2', 'b3', 'b4']);
	});

	test('it starts over when the loader gives a new first page', async () => {
		let paged: PagedRows<string> | undefined;
		function Rows() {
			paged = usePagedRows(useLoaderData() as Page, (p) => p.items);
			return null;
		}
		const { router } = await mount(Rows);
		await act(async () => paged?.loadMore());
		await settle();
		expect(paged?.rows).toHaveLength(4);
		await act(async () => {
			await router.navigate('/rows?q=z');
		});
		await settle();
		expect(paged?.rows).toEqual(['z1', 'z2']);
		expect(paged?.next).toBe('p2');
	});

	test('the cursor is asked with the search the page is on', async () => {
		const asked: string[] = [];
		let paged: PagedRows<string> | undefined;
		function Rows() {
			paged = usePagedRows(useLoaderData() as Page, (p) => p.items);
			return null;
		}
		await mount(Rows, {
			path: '/rows?q=c',
			loader: (url) => {
				asked.push(url.search);
				return pageOf(url);
			},
		});
		await act(async () => paged?.loadMore());
		await settle();
		expect(asked.at(-1)).toBe('?q=c&after=p2');
	});

	test('a failed page keeps the rows and sets error; the next try clears it', async () => {
		let paged: PagedRows<string> | undefined;
		let fail = true;
		function Rows() {
			paged = usePagedRows(useLoaderData() as Page, (p) => p.items);
			return null;
		}
		await mount(Rows, {
			loader: (url) =>
				url.searchParams.has('after') && fail
					? { message: 'busy' }
					: pageOf(url),
		});
		await act(async () => paged?.loadMore());
		await settle();
		expect(paged?.error).toBe(true);
		expect(paged?.rows).toEqual(['a1', 'a2']);
		expect(paged?.next).toBe('p2');
		fail = false;
		await act(async () => paged?.loadMore());
		await settle();
		expect(paged?.error).toBe(false);
		expect(paged?.rows).toEqual(['a1', 'a2', 'a3', 'a4']);
	});

	test('data that is not a page sets error and keeps the rows (null)', async () => {
		let paged: PagedRows<string> | undefined;
		function Rows() {
			paged = usePagedRows(useLoaderData() as Page, (p) => p.items);
			return null;
		}
		await mount(Rows, {
			loader: (url) =>
				url.searchParams.get('after') === 'p2' ? null : pageOf(url),
		});
		await act(async () => paged?.loadMore());
		await settle();
		expect(paged?.rows).toEqual(['a1', 'a2']);
		expect(paged?.error).toBe(true);
	});

	test('a loader wrapped in orFailed that throws on a cursor sets error and keeps the rows', async () => {
		let paged: PagedRows<string> | undefined;
		function Rows() {
			paged = usePagedRows(useLoaderData() as Page, (p) => p.items);
			return null;
		}
		await mount(Rows, {
			loader: (url) =>
				orFailed(url.searchParams.get('after'), async () => {
					if (url.searchParams.has('after')) throw new Error('down');
					return pageOf(url);
				}),
		});
		expect(paged?.rows).toEqual(['a1', 'a2']);
		await act(async () => paged?.loadMore());
		await settle();
		expect(paged?.rows).toEqual(['a1', 'a2']);
		expect(paged?.error).toBe(true);
		expect(paged?.next).toBe('p2');
	});

	test('cursorParam and nextOf are honoured', async () => {
		const asked: string[] = [];
		let paged: PagedRows<string> | undefined;
		function Rows() {
			paged = usePagedRows(
				useLoaderData() as { rows: string[]; token: string | null },
				(p) => p.rows,
				{ cursorParam: 'cursor', nextOf: (p) => p.token },
			);
			return null;
		}
		await mount(Rows, {
			loader: (url) => {
				asked.push(url.search);
				return url.searchParams.has('cursor')
					? { rows: ['y'], token: null }
					: { rows: ['x'], token: 't1' };
			},
		});
		await act(async () => paged?.loadMore());
		await settle();
		expect(asked.at(-1)).toBe('?cursor=t1');
		expect(paged?.rows).toEqual(['x', 'y']);
		expect(paged?.next).toBeNull();
	});

	test('loadMore does nothing at the end', async () => {
		let paged: PagedRows<string> | undefined;
		function Rows() {
			paged = usePagedRows({ items: ['only'], next: null }, (p) => p.items);
			return null;
		}
		await mount(Rows);
		await act(async () => paged?.loadMore());
		await settle();
		expect(paged?.rows).toEqual(['only']);
		expect(paged?.loading).toBe(false);
	});

	test('it renders on the server with the first page', () => {
		stubRender();
	});
});

function stubRender() {
	const Stub = createRoutesStub([
		{
			path: '/',
			Component: () => {
				const { rows } = usePagedRows(
					{ items: ['s1'], next: 'n' } as Page,
					(p) => p.items,
				);
				return createElement('p', null, rows.join(','));
			},
		},
	]);
	expect(renderToString(createElement(Stub))).toContain('s1');
}

describe('useSearchChange', () => {
	test('sets, deletes and drops the cursor, replacing the entry', async () => {
		let change: ReturnType<typeof useSearchChange> | undefined;
		function Page() {
			change = useSearchChange();
			return null;
		}
		const { router } = await mount(Page, { path: '/rows?q=a&after=p2&old=1' });
		await act(async () => change?.({ q: 'b', old: null, gone: undefined }));
		await settle();
		expect(router.state.location.search).toBe('?q=b');
		expect(String(router.state.historyAction)).toBe('REPLACE');
	});

	test('an empty string is a value, and resetKeys replaces the default', async () => {
		let change: ReturnType<typeof useSearchChange> | undefined;
		function Page() {
			change = useSearchChange({ resetKeys: ['page', 'after'] });
			return null;
		}
		const { router } = await mount(Page, { path: '/rows?page=3&after=x&k=1' });
		await act(async () => change?.({ q: '' }));
		await settle();
		expect(router.state.location.search).toBe('?k=1&q=');
	});

	test('a whole URLSearchParams replaces the search, keeping the replace behaviour', async () => {
		let change: ReturnType<typeof useSearchChange> | undefined;
		function Page() {
			change = useSearchChange();
			return null;
		}
		const { router } = await mount(Page, { path: '/rows?q=a&after=p2&old=1' });
		await act(async () =>
			change?.(new URLSearchParams({ status: 'open', after: 'p3' })),
		);
		await settle();
		expect(router.state.location.search).toBe('?status=open&after=p3');
		expect(String(router.state.historyAction)).toBe('REPLACE');
	});

	test('an updater gets the current search and returns the next one', async () => {
		let change: ReturnType<typeof useSearchChange> | undefined;
		function Page() {
			change = useSearchChange();
			return null;
		}
		const { router } = await mount(Page, { path: '/rows?q=a&old=1' });
		await act(async () =>
			change?.((prev) => {
				const next = new URLSearchParams(prev);
				next.delete('old');
				next.set('page', '2');
				return next;
			}),
		);
		await settle();
		expect(router.state.location.search).toBe('?q=a&page=2');
		expect(String(router.state.historyAction)).toBe('REPLACE');
	});

	test('a search change reaches usePagedRows as a new first page (the cursor is gone)', async () => {
		let change: ReturnType<typeof useSearchChange> | undefined;
		let paged: PagedRows<string> | undefined;
		function Page() {
			change = useSearchChange();
			paged = usePagedRows(useLoaderData() as Page, (p) => p.items);
			return null;
		}
		const { router } = await mount(Page, { path: '/rows?after=p2' });
		expect(paged?.rows).toEqual(['a3', 'a4']);
		await act(async () => change?.({ q: 'n' }));
		await settle();
		expect(router.state.location.search).toBe('?q=n');
		expect(paged?.rows).toEqual(['n1', 'n2']);
	});
});

describe('useSameRouteLoading', () => {
	test('true while another search of the same pathname loads, false for another page', async () => {
		let release: (() => void) | undefined;
		const gate = () =>
			new Promise<void>((resolve) => {
				release = resolve;
			});
		const seen: boolean[] = [];
		function Page() {
			seen.push(useSameRouteLoading());
			return null;
		}
		const { router } = await mount(Page, {
			loader: async (url) => {
				if (url.searchParams.has('q')) await gate();
				return pageOf(url);
			},
		});
		expect(seen.every((v) => v === false)).toBe(true);
		let pending: Promise<void> | undefined;
		await act(async () => {
			pending = router.navigate('/rows?q=slow');
		});
		expect(seen.at(-1)).toBe(true);
		await act(async () => {
			release?.();
			await pending;
		});
		await settle();
		expect(seen.at(-1)).toBe(false);

		seen.length = 0;
		await act(async () => {
			await router.navigate('/other');
		});
		expect(seen.includes(true)).toBe(false);
	});

	test('false on the server', () => {
		const Stub = createRoutesStub([
			{
				path: '/',
				Component: () =>
					createElement('p', null, String(useSameRouteLoading())),
			},
		]);
		expect(renderToString(createElement(Stub))).toContain('false');
	});
});
