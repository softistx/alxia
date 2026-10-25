import {
	createApiErrors,
	createApiMessages,
	errorRequestId,
	routeError,
} from '@alxia/react-router/errors';
import { useRouteError } from 'react-router';

const apiErrors = createApiErrors<'en'>({
	messages: createApiMessages<'en'>({ format: (message) => message }),
	unavailable: () => 'Unavailable',
});

/** An API's refusal, in the shape `@nxgt/graphql-client`'s `ApiError` has. */
function refusal(status: number) {
	return Object.assign(new Error('Nothing here'), {
		name: 'ApiError',
		status,
		code: 'todos.errors.not-found',
		requestId: 'r-1',
		errors: [
			{
				message: 'Nothing here',
				extensions: { code: 'todos.errors.not-found' },
			},
		],
	});
}

export function loader(): never {
	throw routeError(refusal(404));
}

export function action() {
	return apiErrors.fetcherResult('en', { intent: 'rename' }, () =>
		Promise.reject(refusal(409)),
	);
}

export default function Refused() {
	return <p>never rendered</p>;
}

export function ErrorBoundary() {
	const error = useRouteError();
	return <p id="request">{errorRequestId(error) ?? 'none'}</p>;
}
