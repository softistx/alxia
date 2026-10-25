/** What a form action answers when the API refused the input. */
export type FormErrors = {
	/** Messages by form field, already translated. */
	fieldErrors?: Record<string, string>;
	/** A message for the form as a whole, already translated. */
	formError?: string | undefined;
};
