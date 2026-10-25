import { createApiMessages } from '../../src/errors';
import { CATALOGUE } from './catalogue';
import { format, type Lang } from './format';

// Run by messages-day.spec.ts in a process of its own, with a time zone set
// in its environment (a zone cannot change under a running process): prints
// what the catalogue says of a day.
const messages = createApiMessages<Lang>({ format });
messages.set('en', CATALOGUE.en);
messages.set('fr', CATALOGUE.fr);
console.log(
	JSON.stringify(
		(['en', 'fr'] as const).map((language) =>
			messages.apiMessage(
				'todos.errors.due-after-end',
				{ endDate: '2027-02-12' },
				language,
			),
		),
	),
);
