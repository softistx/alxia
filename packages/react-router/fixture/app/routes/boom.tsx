export function loader(): never {
	throw new Error('the loader exploded');
}

export default function Boom() {
	return <p>never rendered</p>;
}
