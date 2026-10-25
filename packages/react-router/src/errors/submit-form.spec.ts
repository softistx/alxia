import { describe, expect, test } from 'bun:test';
import { refusal, strictErrors } from '../../test/errors/refusal';
import type { FormErrors } from './form-errors';

const errors = strictErrors();
const INVALID = 'validation.errors.invalid-input';

const refused = (
	extensions: Record<string, unknown> & { code?: string },
	message = 'Refused',
) => refusal(extensions.code, message, extensions);

const fail = (error: unknown) => () => Promise.reject(error);
const fieldOf = (path: string): string | undefined =>
	path === 'list.title' ? 'title' : undefined;

const submit = (error: unknown, place = fieldOf) =>
	errors.submitForm('fr', fail(error), place);

/** What `data()` carries: its body and status. */
const answer = (result: unknown) =>
	result as { data: FormErrors; init: { status: number } };

describe('submitForm', () => {
	test("answers the mutation's value", async () => {
		expect(
			await errors.submitForm('fr', () => Promise.resolve(1), fieldOf),
		).toEqual({
			ok: true,
			value: 1,
		});
	});

	test('puts a placed field error under its field, with no form error', async () => {
		const error = refused({
			code: INVALID,
			http: { status: 400 },
			fields: [
				{
					path: 'list.title',
					code: 'validation.errors.required',
					message: 'x',
				},
			],
		});
		const { data, init } = answer(await submit(error));
		expect(init.status).toBe(400);
		expect(data).toEqual({
			fieldErrors: { title: 'Obligatoire.' },
			formError: undefined,
		});
	});

	test('an unplaced field error joins the form error', async () => {
		const error = refused({
			code: INVALID,
			http: { status: 400 },
			fields: [
				{ path: 'items.0', code: 'x.errors.unknown', message: 'Inconnu' },
			],
		});
		const { data } = answer(await submit(error));
		expect(data.formError).toContain('Inconnu');
	});

	test('a code with params is worded with them, under the field of its path', async () => {
		const rows = (path: string) =>
			path.startsWith('rows.') ? path : undefined;
		const error = refused({
			code: INVALID,
			http: { status: 400 },
			fields: [
				{
					path: 'rows.1.name',
					code: 'todos.errors.items-outside-list',
					message: 'Outside',
					params: { count: 3, name: 'Home' },
				},
			],
		});
		const { data } = answer(await submit(error, rows));
		expect(data).toEqual({
			fieldErrors: { 'rows.1.name': expect.stringContaining('3 éléments') },
			formError: undefined,
		});
	});

	test("a refusal on the whole input is the form's message, never a guessed field", async () => {
		const error = refused({
			code: INVALID,
			http: { status: 400 },
			fields: [
				{
					path: 'input',
					code: 'validation.errors.invalid',
					message: 'Invalid',
				},
			],
		});
		const { data } = answer(await submit(error));
		expect(data.fieldErrors).toEqual({});
		expect(data.formError).toBeString();
	});

	test("a code with no fields is the form's message, with its status", async () => {
		const error = refused(
			{ code: 'todos.errors.title-taken', http: { status: 409 } },
			'Taken',
		);
		const { data, init } = answer(await submit(error));
		expect(init.status).toBe(409);
		expect(data.formError).toBe('Une autre tâche a déjà ce titre.');
	});

	test('401, 404 and non-API failures go to the error page', async () => {
		for (const status of [401, 404]) {
			const thrown = await submit(refused({ http: { status } })).catch(
				(e) => e,
			);
			expect(answer(thrown).init.status).toBe(status);
		}
		const down = new Error('down');
		await expect(submit(down)).rejects.toBe(down);
	});

	test('a refusal naming one field (extensions.field) goes under it, a 404 too', async () => {
		const place = (path: string): string | undefined =>
			path === 'listId' ? 'list' : undefined;
		const error = refused(
			{
				code: 'todos.errors.title-taken',
				http: { status: 404 },
				field: 'listId',
			},
			'List not found.',
		);
		const { data, init } = answer(await submit(error, place));
		expect(init.status).toBe(404);
		expect(data).toEqual({
			fieldErrors: { list: expect.any(String) },
			formError: undefined,
		});
	});

	test('a 404 on a field the form does not show still goes to the error page', async () => {
		const error = refused({
			code: 'todos.errors.title-taken',
			http: { status: 404 },
			field: 'listId',
		});
		const thrown = await submit(error).catch((e) => e);
		expect(answer(thrown).init.status).toBe(404);
	});

	test("a 409 naming a field the form does not show is the form's message", async () => {
		const error = refused(
			{
				code: 'todos.errors.title-taken',
				http: { status: 409 },
				field: 'yearId',
			},
			'Closed.',
		);
		const { data } = answer(await submit(error));
		expect(data.formError).toBeTruthy();
		expect(data.fieldErrors).toEqual({});
	});
});

describe('the route option', () => {
	test('submitForm passes it to the error page', async () => {
		const gone = () =>
			new Response(null, { status: 410, headers: { 'x-request-id': 'r-1' } });
		const route = { statuses: new Set([410]) };
		const plain = await errors
			.submitForm('fr', fail(gone()), fieldOf)
			.catch((e) => e);
		expect(plain).toBeInstanceOf(Response);
		const routed = await errors
			.submitForm('fr', fail(gone()), fieldOf, route)
			.catch((e) => e);
		expect(answer(routed)).toMatchObject({
			data: { requestId: 'r-1' },
			init: { status: 410 },
		});
	});
});
