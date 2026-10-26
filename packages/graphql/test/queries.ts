/** A query of exactly `tokens` tokens: `ping`, aliases of three tokens each, plain fields. */
export function queryOf(tokens: number): string {
	const body = tokens - 3;
	const aliases = Math.floor(body / 3);
	const fields = [
		...Array.from({ length: aliases }, (_, i) => `a${i}: ping`),
		...Array.from({ length: body - 3 * aliases }, () => 'ping'),
	];
	return `{ ping ${fields.join(' ')} }`;
}
