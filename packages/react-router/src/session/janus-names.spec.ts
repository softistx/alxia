import { describe, expect, test } from 'bun:test';
import type {
	JanusErrorCode,
	SignInResult,
	StepUpByApp,
	StepUpByEmail,
} from '@nxgt/janus';
import { CHALLENGE_OVER, INVALID_CODE } from './codes';
import type { SignInStatus, StepUpVia } from './model';
import { STEP_UP_OVER, STEP_UP_REQUIRED } from './step-up-codes';

// The names this subpath speaks are `@nxgt/janus`'s. The assertions below are
// checked by `tsc` (the package's `typecheck` runs over the specs): a janus
// that renames a status or a `via` stops compiling here.
type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
const same = <T extends true>(_: T) => undefined;

same<Equal<SignInStatus, SignInResult<never>['status']>>(true);
same<Equal<StepUpVia, StepUpByEmail<never>['via'] | StepUpByApp<never>['via']>>(
	true,
);

const codes: readonly JanusErrorCode[] = [
	INVALID_CODE,
	...CHALLENGE_OVER,
	...STEP_UP_OVER,
	STEP_UP_REQUIRED,
] as const;

describe('@nxgt/janus’s names', () => {
	test('the sign-in statuses and the step-up ways are janus’s', () => {
		const statuses: SignInStatus[] = ['signedIn', 'secondFactor'];
		const ways: StepUpVia[] = ['email', 'secondFactor'];
		expect(statuses).toEqual(['signedIn', 'secondFactor']);
		expect(ways).toEqual(['email', 'secondFactor']);
	});

	test('the default codes are janus’s error codes', () => {
		expect([...new Set(codes)]).toEqual([
			'CODE_INVALID',
			'TOKEN_UNKNOWN',
			'TOKEN_SPENT',
			'TOKEN_EXPIRED',
			'TOKEN_STALE',
			'SECOND_FACTOR_ACTIVE',
			'SECOND_FACTOR_NOT_ENROLLED',
			'STEP_UP_REQUIRED',
		]);
	});
});
