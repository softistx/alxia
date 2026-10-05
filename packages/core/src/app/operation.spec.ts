import { describe, expect, test } from 'bun:test';
import { alxia } from './alxia';
import {
	type OperationSummary,
	operationOf,
	reportOperation,
} from './operation';

/** An app whose observer reads the summary once the handler has reported. */
function observed(report: (ctx: object) => void) {
	const seen: Array<OperationSummary | undefined> = [];
	const app = alxia()
		.use(async (ctx, next) => {
			const response = await next();
			seen.push(operationOf(ctx));
			return response;
		})
		.get('/q', (ctx) => {
			report(ctx);
			return ctx.reply(200);
		});
	return { app, seen };
}

describe('operations reported to the observers', () => {
	test('one operation is read as it was reported, an anonymous one without a name', async () => {
		const { app, seen } = observed((ctx) =>
			reportOperation(ctx, { type: 'query', name: 'GetNotes' }),
		);
		await app.request('/q');
		const anonymous = observed((ctx) =>
			reportOperation(ctx, { type: 'mutation' }),
		);
		await anonymous.app.request('/q');
		expect(seen).toEqual([{ type: 'query', name: 'GetNotes' }]);
		expect(anonymous.seen).toEqual([{ type: 'mutation', name: undefined }]);
	});

	test('several are a batch, with the names of the named ones joined', async () => {
		const { app, seen } = observed((ctx) => {
			reportOperation(ctx, { type: 'query', name: 'GetNotes' });
			reportOperation(ctx, { type: 'query' });
			reportOperation(ctx, { type: 'mutation', name: 'AddNote' });
		});
		await app.request('/q');
		expect(seen).toEqual([{ type: 'batch', name: 'GetNotes,AddNote' }]);
	});

	test('none reported is undefined, and a context with no run is ignored', async () => {
		const { app, seen } = observed(() => {});
		await app.request('/q');
		expect(seen).toEqual([undefined]);
		reportOperation({}, { type: 'query' });
		expect(operationOf({})).toBeUndefined();
	});
});
