/** Whether npm's registry knows the package. A network failure answers no. */
export async function onRegistry(name: string): Promise<boolean> {
	const res = await fetch(
		`https://registry.npmjs.org/${name.replace('/', '%2F')}`,
		{ method: 'HEAD' },
	).catch(() => null);
	return res?.ok ?? false;
}

/** The version npm's `latest` tag names. Throws when the registry cannot say. */
export async function latestOnRegistry(name: string): Promise<string> {
	const res = await fetch(
		`https://registry.npmjs.org/${name.replace('/', '%2F')}/latest`,
	);
	if (!res.ok) {
		throw new Error(
			`npm has no latest ${name}: ${res.status} ${res.statusText}`,
		);
	}
	const { version } = (await res.json()) as { version?: unknown };
	if (typeof version !== 'string') {
		throw new Error(`npm's latest ${name} names no version.`);
	}
	return version;
}
