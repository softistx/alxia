import type { CatalogueMessages } from '../../src/errors';
import type { Lang } from './format';

const required = (message: string) => ({ message, params: [] });

/** A small API catalogue in two languages: a plural, a day, a number and a select. */
export const CATALOGUE: Record<Lang, CatalogueMessages> = {
	en: {
		'validation.errors.required': required('Required.'),
		'todos.errors.title-taken': required(
			'Another todo already has this title.',
		),
		'notes.errors.too-many-attempts': {
			message:
				'Too many attempts. Try again in {minutes, plural, one {# minute} other {# minutes}}.',
			params: [{ name: 'minutes', kind: 'NUMBER' }],
		},
		'todos.errors.items-outside-list': {
			message:
				'{count, plural, one {One item is} other {# items are}} outside {name}.',
			params: [
				{ name: 'count', kind: 'PLURAL' },
				{ name: 'name', kind: 'TEXT' },
			],
		},
		'todos.errors.due-after-end': {
			message:
				'The list ends on {endDate, date, long}: a todo cannot be due later.',
			params: [{ name: 'endDate', kind: 'DATE' }],
		},
		'notes.errors.length-over': {
			message:
				'{case, select, lowered {{count} notes are already over {outOf, number}: shorten them first.} other {A note cannot be over {outOf, number}.}}',
			params: [
				{ name: 'case', kind: 'SELECT' },
				{ name: 'outOf', kind: 'NUMBER' },
				{ name: 'count', kind: 'NUMBER' },
			],
		},
	},
	fr: {
		'validation.errors.required': required('Obligatoire.'),
		'todos.errors.title-taken': required('Une autre tâche a déjà ce titre.'),
		'notes.errors.too-many-attempts': {
			message:
				'Trop de tentatives. Réessayez dans {minutes, plural, one {# minute} other {# minutes}}.',
			params: [{ name: 'minutes', kind: 'NUMBER' }],
		},
		'todos.errors.items-outside-list': {
			message:
				'{count, plural, one {Un élément est} other {# éléments sont}} hors de {name}.',
			params: [
				{ name: 'count', kind: 'PLURAL' },
				{ name: 'name', kind: 'TEXT' },
			],
		},
		'todos.errors.due-after-end': {
			message:
				'La liste se termine le {endDate, date, long} : une tâche ne peut pas être due plus tard.',
			params: [{ name: 'endDate', kind: 'DATE' }],
		},
		'notes.errors.length-over': {
			message:
				'{case, select, lowered {{count} notes dépassent déjà {outOf, number} : raccourcissez-les d’abord.} other {Une note ne peut pas dépasser {outOf, number}.}}',
			params: [
				{ name: 'case', kind: 'SELECT' },
				{ name: 'outOf', kind: 'NUMBER' },
				{ name: 'count', kind: 'NUMBER' },
			],
		},
	},
};
