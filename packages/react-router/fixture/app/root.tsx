import {
	CspNonceMeta,
	InlineScript,
	useNonce,
} from '@alxia/react-router/document';
import { type ReactNode, useEffect, useRef, ViewTransition } from 'react';
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLocation,
	useRouteError,
} from 'react-router';

export function Layout({ children }: { children: ReactNode }) {
	const nonce = useNonce();
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<InlineScript code="document.documentElement.dataset.booted='1'" />
				<CspNonceMeta />
				<Meta />
				<Links nonce={nonce} />
			</head>
			<body>
				{children}
				<ScrollRestoration nonce={nonce} />
				<Scripts nonce={nonce} />
			</body>
		</html>
	);
}

export default function App() {
	const { pathname } = useLocation();
	const shown = useRef(pathname);
	useEffect(() => {
		shown.current = pathname;
	}, [pathname]);
	return (
		<ViewTransition update={shown.current === pathname ? 'none' : 'auto'}>
			<Outlet />
		</ViewTransition>
	);
}

export function ErrorBoundary() {
	const error = useRouteError();
	const message = isRouteErrorResponse(error)
		? `${error.status} ${error.data}`
		: error instanceof Error
			? error.message
			: 'unknown';
	return (
		<main>
			<h1>Oops</h1>
			<p id="error">{message}</p>
		</main>
	);
}
