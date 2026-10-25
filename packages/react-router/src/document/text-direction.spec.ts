import { expect, test } from 'bun:test';
import { textDirection } from './text-direction';

test('right-to-left base languages are rtl, whatever the case or region', () => {
	for (const tag of [
		'ar',
		'AR',
		'ar-EG',
		'fa-IR',
		'he',
		'ckb',
		'ur_PK',
		'ug',
	]) {
		expect(textDirection(tag)).toBe('rtl');
	}
});

test('the others are ltr', () => {
	for (const tag of ['en', 'en-US', 'fr', 'pt-BR', 'zh-Hans', '']) {
		expect(textDirection(tag)).toBe('ltr');
	}
});

test('a script subtag is not read (known gap)', () => {
	expect(textDirection('az-Arab')).toBe('ltr');
});
