/** A code of an authenticator app: six digits. */
export const TOTP_CODE: RegExp = /^\d{6}$/;

/**
 * What a second-factor form sends: `code` is the issued code (an app's, or
 * the one mailed), `recovery` a recovery code. Janus has no name for it, only
 * `confirm` and `recover`.
 */
export type SecondFactorKind = 'code' | 'recovery';

/** How a sign-in ended, in `@nxgt/janus`'s words (`SignInResult['status']`). */
export type SignInStatus = 'signedIn' | 'secondFactor';

/**
 * How a step-up is confirmed, in `@nxgt/janus`'s words: a code mailed to the
 * current address, or the account's second factor.
 */
export type StepUpVia = 'email' | 'secondFactor';
