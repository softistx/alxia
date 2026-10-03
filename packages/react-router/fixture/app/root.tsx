import type { ReactNode } from 'react';
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useRouteError,
} from 'react-router';

export function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
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
