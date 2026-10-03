import { alxiaOf } from '@alxia/react-router';
import {
	type ActionFunctionArgs,
	data,
	Form,
	type LoaderFunctionArgs,
	useActionData,
	useLoaderData,
} from 'react-router';
import type { Base } from '../../base';

export function loader({ context }: LoaderFunctionArgs) {
	const { user, route } = alxiaOf<Base>(context);
	return { name: user?.name ?? 'anonymous', route };
}

export async function action({ request, context }: ActionFunctionArgs) {
	const form = await request.formData();
	const step = Number(form.get('step'));
	if (!Number.isInteger(step))
		return data({ error: 'not a step' }, { status: 400 });
	return { added: step, by: alxiaOf<Base>(context).user?.name ?? 'anonymous' };
}

export default function Home() {
	const { name, route } = useLoaderData<typeof loader>();
	const acted = useActionData<typeof action>();
	return (
		<main>
			<h1>Hello {name}</h1>
			<p id="route">{route}</p>
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
