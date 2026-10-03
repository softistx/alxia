import { redirect } from 'react-router';

export function action() {
	const headers = new Headers();
	headers.append('set-cookie', 'a=1; Path=/; HttpOnly');
	headers.append('set-cookie', 'b=2; Path=/; HttpOnly');
	return redirect('/', { headers });
}

export default function Login() {
	return (
		<form method="post">
			<button type="submit">sign in</button>
		</form>
	);
}
