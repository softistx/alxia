import { Suspense, use } from 'react';
import { useLoaderData } from 'react-router';

/** Rejects after the shell went out: the spec reads onError for it. */
export function loader() {
	const later = new Promise<string>((_, reject) =>
		setTimeout(() => reject(new Error('the suspended part exploded')), 100),
	);
	later.catch(() => {});
	return { later };
}

function Late({ later }: { later: Promise<string> }) {
	return <p>{use(later)}</p>;
}

export default function LateBoom() {
	const { later } = useLoaderData<typeof loader>();
	return (
		<main>
			<p>shell</p>
			<Suspense fallback={<p>loading</p>}>
				<Late later={later} />
			</Suspense>
		</main>
	);
}
