import { describe, expect, test } from 'bun:test';
import { format, type Lang } from '../../test/errors/format';
import { createApiMessages } from './messages';
import { ApiMessagesProvider } from './provider';

const CODE = 'validation.errors.required';
const entry = (message: string) => ({ message, params: [] });

function setup() {
	const messages = createApiMessages<Lang>({ format });
	messages.add('en', { [CODE]: entry('Older text.') });
	const provide = () =>
		ApiMessagesProvider({
			messages,
			value: { en: { [CODE]: entry('Client text.') }, fr: {} },
			children: 'page',
		});
	return { messages, provide };
}

describe('ApiMessagesProvider', () => {
	test('a server render leaves the server catalogue as it is, and returns the children', () => {
		const { messages, provide } = setup();
		expect(provide()).toBe('page');
		expect(messages.messageOf('en', CODE)?.message).toBe('Older text.');
	});

	test('in the browser it fills the store before the children render', () => {
		const { messages, provide } = setup();
		const globals = globalThis as { document?: unknown };
		globals.document = {};
		try {
			expect(provide()).toBe('page');
		} finally {
			delete globals.document;
		}
		expect(messages.messageOf('en', CODE)?.message).toBe('Client text.');
	});

	test('with no value it writes nothing', () => {
		const { messages } = setup();
		const globals = globalThis as { document?: unknown };
		globals.document = {};
		try {
			ApiMessagesProvider({ messages, value: undefined, children: null });
		} finally {
			delete globals.document;
		}
		expect(messages.messageOf('en', CODE)?.message).toBe('Older text.');
	});
});
