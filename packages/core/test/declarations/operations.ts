// What an observer reads of the operation a request ran, behind exported
// functions whose return types are inferred: a declaration build must be
// able to name them through `@alxia/core` alone (TS2883 otherwise).
import { alxia, operationOf, reportOperation } from '@alxia/core';

export function operationObserved() {
	return alxia()
		.use(async (ctx, next) => {
			const response = await next();
			void operationOf(ctx);
			return response;
		})
		.post('/graphql', (ctx) => {
			reportOperation(ctx, { type: 'query', name: 'GetNotes' });
			return ctx.reply(200);
		});
}

export function operationRead(ctx: object) {
	return operationOf(ctx);
}
