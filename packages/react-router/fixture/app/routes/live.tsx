import { alxiaOf } from '@alxia/react-router';
import {
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
	useLoaderData,
} from 'react-router';

/** The topic `/api/live` subscribes its sockets to. */
export const TOPIC = 'live';

export function loader({ context }: LoaderFunctionArgs) {
	// `context.alxia`, typed by the server `app/server.ts` registers, with
	// react-router's own `LoaderFunctionArgs`: `server` is core's.
	const { user, server } = context.alxia;
	const typed: Bun.Server<unknown> | undefined = server;
	void typed;
	// @ts-expect-error: nothing in the registered server adds `tenant`
	context.alxia.tenant;
	return {
		name: user?.name ?? 'anonymous',
		serving: server?.url.href ?? null,
	};
}

export async function action({ request, context }: ActionFunctionArgs) {
	const said = String((await request.formData()).get('said'));
	// Bun's own publish, to every socket `/api/live` subscribed.
	const sent =
		alxiaOf(context).server?.publish(TOPIC, JSON.stringify({ said })) ?? null;
	return { sent };
}

export default function Live() {
	const { name, serving } = useLoaderData<typeof loader>();
	return (
		<main>
			<p id="name">{name}</p>
			<p id="serving">{serving ?? 'no server'}</p>
		</main>
	);
}
