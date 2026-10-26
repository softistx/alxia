import { Suspense } from 'react';
import { Await, useLoaderData } from 'react-router';

/** A deferred value that never arrives: the render ends only by its deadline. */
export function loader() {
	return { now: 'hang-shell', later: new Promise<string>(() => {}) };
}

export default function Hang() {
	const { now, later } = useLoaderData<typeof loader>();
	return (
		<main>
			<p>{now}</p>
			<Suspense fallback={<p id="fallback">loading</p>}>
				<Await resolve={later}>{(value) => <p>{value}</p>}</Await>
			</Suspense>
		</main>
	);
}
