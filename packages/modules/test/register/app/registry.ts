import { defineModule } from '@alxia/modules';

const notes = { kind: 'notes' } as const;
const tags = { kind: 'tags' } as const;
const audit = { kind: 'audit' } as const;

export const base = defineModule({ name: 'base', collections: { tags } });
export const notesModule = defineModule({
	name: 'notes',
	dependsOn: ['base'],
	collections: { notes },
});
export const auditModule = defineModule({
	name: 'audit',
	collections: { audit },
});

export const registered = [base, notesModule, auditModule] as const;

declare module '@alxia/modules' {
	interface Register {
		modules: typeof registered;
	}
}
