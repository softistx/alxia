/**
 * The page transition `regenerate-react-router-template.ts` adds to React
 * Router's scaffold: `app/root.tsx`'s `<Outlet />` in React's
 * `<ViewTransition>`, animating a change of pathname only, `app/app.css`'s
 * reduced-motion rule, and the React that exports it.
 */

/** What `atViewTransitionReact` reads and writes of a manifest. */
export interface ReactManifest {
	dependencies: Record<string, string>;
	devDependencies?: Record<string, string>;
	[key: string]: unknown;
}

/**
 * The edits `addViewTransition` makes to the scaffold's `app/root.tsx`, each
 * a text it expects exactly once and its replacement: React's hooks and
 * `<ViewTransition>`, `useLocation`, and the `<Outlet />` wrapped in one
 * boundary that animates a navigation to another pathname only, so a
 * fetcher's answer or a new `?q=` updates the page in place.
 */
export const VIEW_TRANSITION_EDITS: ReadonlyArray<readonly [string, string]> = [
	// Not the transition: React Router's `<Links>` does not suppress the
	// hydration warning for its critical-CSS `<style nonce>` in development,
	// so the root hands it the nonce `useNonce()` reads in the browser.
	[
		'import type { Route } from "./+types/root";\n',
		'import { useNonce } from "@alxia/react-router/document";\n\nimport type { Route } from "./+types/root";\n',
	],
	[
		'export function Layout({ children }: { children: React.ReactNode }) {\n',
		'export function Layout({ children }: { children: React.ReactNode }) {\n  const nonce = useNonce();\n',
	],
	['<Links />', '<Links nonce={nonce} />'],
	[
		'import {\n',
		'import { useEffect, useRef, ViewTransition } from "react";\nimport {\n',
	],
	[
		'  ScrollRestoration,\n} from "react-router";\n',
		'  ScrollRestoration,\n  useLocation,\n} from "react-router";\n',
	],
	[
		'  return <Outlet />;\n',
		[
			'  // One boundary for the pages: a navigation to another pathname',
			"  // animates, while a fetcher's answer or a new ?q= updates in place.",
			'  const { pathname } = useLocation();',
			'  const shown = useRef(pathname);',
			'  useEffect(() => {',
			'    shown.current = pathname;',
			'  }, [pathname]);',
			'  return (',
			'    <ViewTransition update={shown.current === pathname ? "none" : "auto"}>',
			'      <Outlet />',
			'    </ViewTransition>',
			'  );',
			'',
		].join('\n'),
	],
];

/**
 * `app/root.tsx` with its `<Outlet />` in React's `<ViewTransition>`
 * (`VIEW_TRANSITION_EDITS`). A root whose `<ViewTransition>` already takes
 * an `update` is kept as it is; one where an edit's text is not found exactly once is
 * refused.
 */
export function addViewTransition(root: string): string {
	if (root.includes('<ViewTransition update={')) return root;
	let edited = root;
	for (const [from, to] of VIEW_TRANSITION_EDITS) {
		if (edited.split(from).length !== 2) {
			throw new Error(
				`app/root.tsx: expected ${JSON.stringify(from)} exactly once`,
			);
		}
		edited = edited.replace(from, () => to);
	}
	return edited;
}

/** The rule that stills every view transition for a reader who asks for less motion. */
export const REDUCED_MOTION = `
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none;
  }
}
`;

/** `app/app.css` ending with `REDUCED_MOTION`, unless it already has one. */
export function addReducedMotion(css: string): string {
	return css.includes('prefers-reduced-motion') ? css : css + REDUCED_MOTION;
}

/** The React that exports `<ViewTransition>`, which `app/root.tsx` imports. */
const VIEW_TRANSITION_REACT = '19.3.0';

/**
 * The manifest with `react`, `react-dom` and their types starting at
 * `VIEW_TRANSITION_REACT` at least: the scaffold may still ask for an older
 * React than `addViewTransition`'s root runs on.
 */
export function atViewTransitionReact<M extends ReactManifest>(manifest: M): M {
	const raise = (
		ranges: Record<string, string> | undefined,
		names: string[],
	) => {
		if (ranges === undefined) return ranges;
		const raised = { ...ranges };
		for (const name of names) {
			const range = raised[name];
			const floor = range?.replace(/^[\^~]/, '');
			if (floor && Bun.semver.order(floor, VIEW_TRANSITION_REACT) < 0) {
				raised[name] = `^${VIEW_TRANSITION_REACT}`;
			}
		}
		return raised;
	};
	return {
		...manifest,
		dependencies: raise(manifest.dependencies, ['react', 'react-dom']) ?? {},
		devDependencies: raise(manifest.devDependencies, [
			'@types/react',
			'@types/react-dom',
		]),
	};
}
