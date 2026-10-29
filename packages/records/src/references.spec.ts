import { describe, expect, test } from 'bun:test';
import { createReferences, kindOf, kindsOf } from './index';

const users = { name: 'users' };
const posts = { name: 'posts' };
const relatedPersons = { name: 'relatedPersons' };

describe('createReferences', () => {
	test('lists what references an entity, in registration order', () => {
		const refs = createReferences();
		refs.referencedBy(users, posts, 'authorId');
		refs.referencedBy(users, relatedPersons, 'userId');
		expect(refs.referrersOf(users)).toEqual([
			{ collection: 'posts', field: 'authorId' },
			{ collection: 'relatedPersons', field: 'userId' },
		]);
		expect(refs.referrersOf(posts)).toEqual([]);
	});

	test('two registries do not share state', () => {
		const a = createReferences();
		const b = createReferences();
		a.referencedBy(users, posts, 'authorId');
		expect(b.referrersOf(users)).toEqual([]);
	});

	test('registering the same pointer twice is a bug', () => {
		const refs = createReferences();
		refs.referencedBy(users, posts, 'authorId');
		expect(() => refs.referencedBy(users, posts, 'authorId')).toThrow(
			'posts.authorId already references users',
		);
	});

	test('finds the referrers that still hold the id, through the reader it is given', async () => {
		const refs = createReferences();
		refs.referencedBy(users, posts, 'authorId');
		refs.referencedBy(users, relatedPersons, 'userId');
		const seen: string[] = [];
		const found = await refs.findReferrers(users, 'u1', (referrer, id) => {
			seen.push(`${referrer.collection}.${referrer.field}=${id}`);
			return referrer.collection === 'relatedPersons';
		});
		expect(found).toEqual([{ collection: 'relatedPersons', field: 'userId' }]);
		expect(seen).toEqual(['posts.authorId=u1', 'relatedPersons.userId=u1']);
	});

	test('an entity nothing points at has no referrers and the reader is not called', async () => {
		const refs = createReferences();
		const found = await refs.findReferrers(users, 'u1', () => {
			throw new Error('should not be called');
		});
		expect(found).toEqual([]);
	});

	test('a reader that rejects rejects the search', async () => {
		const refs = createReferences();
		refs.referencedBy(users, posts, 'authorId');
		await expect(
			refs.findReferrers(users, 'u1', async () => {
				throw new Error('not in the scope');
			}),
		).rejects.toThrow('not in the scope');
	});

	test('referenceFieldsOf and labelledFieldsOf name the targets; a label feeds no purge', () => {
		const refs = createReferences();
		refs.referencedBy(users, posts, 'authorId');
		refs.labelledBy(users, posts, 'ownerId');
		expect(refs.referenceFieldsOf(posts)).toEqual(
			new Map([['authorId', 'users']]),
		);
		expect(refs.labelledFieldsOf(posts)).toEqual(
			new Map([
				['authorId', 'users'],
				['ownerId', 'users'],
			]),
		);
		expect(refs.referrersOf(users)).toEqual([
			{ collection: 'posts', field: 'authorId' },
		]);
		expect(() => refs.labelledBy(users, posts, 'ownerId')).toThrow(
			'already has a label target',
		);
	});
});

describe('kinds', () => {
	test('kindOf is the snake_case code of the collection', () => {
		expect(kindOf({ collection: 'relatedPersons' })).toBe('related_persons');
		expect(kindOf({ collection: 'posts' })).toBe('posts');
	});

	test('kindsOf de-duplicates, sorts and joins', () => {
		expect(
			kindsOf([
				{ collection: 'relatedPersons', field: 'a' },
				{ collection: 'allergies', field: 'b' },
				{ collection: 'relatedPersons', field: 'c' },
			]),
		).toBe('allergies,related_persons');
		expect(kindsOf([])).toBe('');
	});
});
