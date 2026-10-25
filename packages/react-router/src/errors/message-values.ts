import type { CatalogueMessage } from './messages';

/** The values a formatter takes: what ICU arguments can be. */
export type MessageValues = Readonly<
	Record<string, string | number | boolean | object>
>;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A local `Date` built from the calendar parts of a `YYYY-MM-DD`: no time-zone shift. */
function dayOf(value: string): Date | undefined {
	const parts = DAY.exec(value);
	if (!parts) return undefined;
	return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
}

/**
 * The values as the message formats them: a `YYYY-MM-DD` the message names
 * as a date becomes a local `Date` (by calendar parts, so the day is the
 * same in every time zone), a count or number given as a numeric string a
 * number. Everything else passes as it is.
 */
export function valuesFor(
	params: CatalogueMessage['params'],
	values: Readonly<Record<string, unknown>>,
): MessageValues {
	const worded: Record<string, unknown> = { ...values };
	for (const { name, kind } of params) {
		const value = values[name];
		if (typeof value !== 'string') continue;
		if (kind === 'DATE') {
			const day = dayOf(value);
			if (day) worded[name] = day;
		} else if (
			(kind === 'NUMBER' || kind === 'PLURAL') &&
			value.trim() !== '' &&
			!Number.isNaN(Number(value))
		) {
			worded[name] = Number(value);
		}
	}
	return worded as MessageValues;
}
