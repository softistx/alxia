import type { CatalogueMessages } from '../../src/errors';
import type { Lang } from './format';

const required = (message: string) => ({ message, params: [] });

/** A small API catalogue in two languages: a plural, a day, a number and a select. */
export const CATALOGUE: Record<Lang, CatalogueMessages> = {
	en: {
		'validation.errors.required': required('Required.'),
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
