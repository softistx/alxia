import { defineRoutes } from '@alxia/core';

export const todos = defineRoutes('/todos').get('/', ({ user, reply }) =>
	reply(200, user.id),
);
