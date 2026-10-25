import { IntlMessageFormat } from 'intl-messageformat';
import type { MessageFormat } from '../../src/errors';

export type Lang = 'en' | 'fr';

/**
 * An ICU formatter the way `@nxgt/material`'s `formatMessage` is one: the
 * same engine, a failure reported to `onError` with the message left as it is.
 */
export const format: MessageFormat<Lang> = (
	message,
	language,
	values,
	{ onError },
) => {
	try {
		return String(new IntlMessageFormat(message, language).format(values));
	} catch (error) {
		onError(error);
		return message;
	}
};
