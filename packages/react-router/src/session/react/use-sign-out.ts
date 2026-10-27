import { useCallback, useState } from 'react';
import { useNavigation, useSubmit } from 'react-router';

/** Where `signInFlow`'s sign-out action is mounted unless the app says otherwise. */
export const SIGN_OUT_PATH = '/sign-out';

export interface SignOutOptions {
	/** The sign-out route (default `/sign-out`). */
	readonly action?: string;
	/**
	 * Runs before the post: clear the worker's caches, a local store. A
	 * rejection never keeps the user signed in: the sign-out goes on.
	 */
	readonly before?: () => Promise<unknown> | unknown;
}

/**
 * Runs `before`, then `submit`. A `before` that throws or rejects is
 * ignored, so a failed cleanup cannot keep a session alive.
 */
export async function signOutAfter(
	before: (() => Promise<unknown> | unknown) | undefined,
	submit: () => Promise<void> | void,
): Promise<void> {
	try {
		await before?.();
	} catch {
		// Signing out matters more than the cleanup.
	}
	await submit();
}

/**
 * The one way a page signs out, wherever the control is: posts `{}` as JSON
 * to the sign-out route (same-origin and JSON only, as `signInFlow`'s action
 * requires). `busy` from the call until the navigation it starts has ended.
 */
export function useSignOut(options: SignOutOptions = {}): {
	signOut: () => void;
	busy: boolean;
} {
	const { action = SIGN_OUT_PATH, before } = options;
	const submit = useSubmit();
	const [preparing, setPreparing] = useState(false);
	const submitting = useNavigation().formAction === action;
	const signOut = useCallback(() => {
		setPreparing(true);
		void signOutAfter(before, () =>
			submit({}, { method: 'post', action, encType: 'application/json' }),
		).finally(() => setPreparing(false));
	}, [submit, action, before]);
	return { signOut, busy: preparing || submitting };
}
