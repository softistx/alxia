import { data } from 'react-router';

export function loader(): never {
	throw data('no such thing', { status: 404 });
}

export default function Missing() {
	return <p>never rendered</p>;
}
