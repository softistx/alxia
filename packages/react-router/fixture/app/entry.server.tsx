import { nonceOf } from '@alxia/react-router';
import { isbot } from 'isbot';
import { renderToReadableStream } from 'react-dom/server';
import {
	type EntryContext,
	type RouterContextProvider,
	ServerRouter,
} from 'react-router';

export const streamTimeout = 5_000;

export default async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	loadContext: RouterContextProvider,
) {
	let status = responseStatusCode;
	// The nonce of the request's Content-Security-Policy, when alxia's hooks set one.
	const nonce = nonceOf(loadContext);
	const body = await renderToReadableStream(
		<ServerRouter
			context={routerContext}
			url={request.url}
			// Under exactOptionalPropertyTypes, ServerRouter's nonce takes no undefined.
			{...(nonce === undefined ? {} : { nonce })}
		/>,
		{
			nonce,
			onError(error: unknown) {
				status = 500;
				console.error(error);
			},
			signal: AbortSignal.timeout(streamTimeout + 1_000),
		},
	);
	const agent = request.headers.get('user-agent');
	if ((agent !== null && isbot(agent)) || routerContext.isSpaMode) {
		await body.allReady;
	}
	responseHeaders.set('Content-Type', 'text/html');
	return new Response(body, { headers: responseHeaders, status });
}

/** The specs provoke a 404 and a 500 on purpose: React Router would print each one. */
export function handleError() {}
