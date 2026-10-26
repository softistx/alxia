type IsBot = (userAgent: string) => boolean;

let loaded: Promise<IsBot> | undefined;

/**
 * `isbot`, imported on the first bot check that needs it and kept: an
 * optional peer, so an app that gives `isBot` never loads it. A failed import
 * is not kept, so a later request tries again.
 */
function defaultIsBot(): Promise<IsBot> {
	loaded ??= import('isbot').then(
		(module) => module.isbot,
		(error: unknown) => {
			loaded = undefined;
			throw error;
		},
	);
	return loaded;
}

/**
 * Whether the response waits for the whole page instead of streaming the
 * shell: a bot (`isBot`, `isbot` by default, imported only then) gets
 * complete HTML to index, and SPA mode renders the one shell the build
 * prerenders.
 */
export async function wantsWholePage(
	request: Request,
	isSpaMode: boolean,
	isBot?: IsBot,
): Promise<boolean> {
	if (isSpaMode) return true;
	const agent = request.headers.get('user-agent');
	if (agent === null) return false;
	return (isBot ?? (await defaultIsBot()))(agent);
}
