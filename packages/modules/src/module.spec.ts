import { expect, test } from 'bun:test';
import { defineModule } from './module';

test('defineModule freezes the manifest and keeps its fields', () => {
	const module = defineModule({ name: 'x', codes: ['x.errors.a'] });
	expect(module.name).toBe('x');
	expect(module.codes).toEqual(['x.errors.a']);
	expect(Object.isFrozen(module)).toBe(true);
});

test('defineModule does not alias the definition it was given', () => {
	const definition = { name: 'x' };
	const module = defineModule(definition);
	expect(module).not.toBe(definition);
	expect(Object.isFrozen(definition)).toBe(false);
});
