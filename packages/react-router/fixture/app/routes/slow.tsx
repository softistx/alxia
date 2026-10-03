import { Suspense } from 'react';
import { Await, useLoaderData } from 'react-router';

/** How long the deferred value takes: the spec reads the first chunk well before it. */
export const DELAY = 600;

export function loader() {
	const later = new Promise<string>((resolve) =>
		setTimeout(() => resolve('deferred-value'), DELAY),
	);
	return { now: 'immediate-value', later };
}

export default function Slow() {
	const { now, later } = useLoaderData<typeof loader>();
	return (
		<main>
			<p>{now}</p>
			<Suspense fallback={<p id="fallback">loading</p>}>
				<Await resolve={later}>{(value) => <p id="later">{value}</p>}</Await>
			</Suspense>
		</main>
	);
}
