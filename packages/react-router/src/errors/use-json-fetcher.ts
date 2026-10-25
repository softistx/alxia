import { type FetcherWithComponents, useFetcher } from 'react-router';

/** What a fetcher can post as JSON. */
export type JsonBody = Parameters<FetcherWithComponents<unknown>['submit']>[0];

/**
 * A fetcher posting JSON to its page's action (which reads it with
 * `readJson`, and answers `fetcherResult` or the like): `post` sends a
 * body, `busy` while it is in flight. `key` shares the fetcher between the
 * form that posts and the component that reads the answer; `action` posts to
 * another route's action instead (a resource route's, such as a
 * `notifications/poll`). `post` takes the target of one call as its second
 * argument (a list's rows each post to their own record's action).
 */
export function useJsonFetcher<Action, Body extends JsonBody = JsonBody>(
	key?: string,
	action?: string,
): {
	fetcher: ReturnType<typeof useFetcher<Action>>;
	post(body: Body, to?: string): Promise<void>;
	busy: boolean;
} {
	const fetcher = useFetcher<Action>(key ? { key } : undefined);
	const post = (body: Body, to = action) =>
		fetcher.submit(body, {
			method: 'post',
			encType: 'application/json',
			...(to ? { action: to } : {}),
		});
	return { fetcher, post, busy: fetcher.state !== 'idle' };
}
