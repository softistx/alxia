import { alxiaOf } from '@alxia/react-router';
import {
	type ActionFunctionArgs,
	data,
	Form,
	type LoaderFunctionArgs,
	useActionData,
	useLoaderData,
} from 'react-router';
import { greetingContext } from '../context';

export function loader({ context }: LoaderFunctionArgs) {
	// Typed by the server `app/server.ts` registers.
	const { user, route } = alxiaOf(context);
	// @ts-expect-error: nothing in the registered server adds `tenant`
	alxiaOf(context).tenant;
	return {
		name: user?.name ?? 'anonymous',
		route,
		greeting: context.get(greetingContext),
	};
}

export async function action({ request, context }: ActionFunctionArgs) {
	const form = await request.formData();
	const step = Number(form.get('step'));
	if (!Number.isInteger(step))
		return data({ error: 'not a step' }, { status: 400 });
	return { added: step, by: alxiaOf(context).user?.name ?? 'anonymous' };
}

export default function Home() {
	const { name, route, greeting } = useLoaderData<typeof loader>();
	const acted = useActionData<typeof action>();
	return (
		<main>
			<h1>Hello {name}</h1>
			<p id="route">{route}</p>
			<p id="greeting">{greeting}</p>
			<Form method="post">
				<input name="step" defaultValue="1" />
				<button type="submit">add</button>
			</Form>
			{acted !== undefined && 'added' in acted ? (
				<p id="added">added {acted.added}</p>
			) : null}
		</main>
	);
}
