/** `@nxgt/janus`'s code for a mutation that needs a recent step-up. */
export const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED';

/**
 * The codes that end a step-up's challenge: unknown, spent, expired or stale,
 * and a second factor that changed since the request (`SECOND_FACTOR_ACTIVE`,
 * `SECOND_FACTOR_NOT_ENROLLED`). The user asks again.
 */
export const STEP_UP_OVER = [
	'TOKEN_UNKNOWN',
	'TOKEN_SPENT',
	'TOKEN_EXPIRED',
	'TOKEN_STALE',
	'SECOND_FACTOR_ACTIVE',
	'SECOND_FACTOR_NOT_ENROLLED',
] as const;
