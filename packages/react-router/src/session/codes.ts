/** `@nxgt/janus`'s code for a wrong second-factor or step-up code. */
export const INVALID_CODE = 'CODE_INVALID';

/** `@nxgt/janus`'s codes for a challenge that is gone: unknown, spent or expired. */
export const CHALLENGE_OVER = [
	'TOKEN_UNKNOWN',
	'TOKEN_SPENT',
	'TOKEN_EXPIRED',
] as const;
