import { isbot } from 'isbot';

/**
 * Whether the response waits for the whole page instead of streaming the
 * shell: a bot (`isBot`, `isbot` by default) gets complete HTML to index,
 * and SPA mode renders the one shell the build prerenders.
 */
export function wantsWholePage(
	request: Request,
	isSpaMode: boolean,
	isBot: (userAgent: string) => boolean = isbot,
): boolean {
	if (isSpaMode) return true;
	const agent = request.headers.get('user-agent');
	return agent !== null && isBot(agent);
}
