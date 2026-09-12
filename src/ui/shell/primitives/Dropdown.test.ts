import { describe, expect, it } from 'vitest';
import { optionText } from './Dropdown';

describe('optionText', () => {
	it('prefixes the value with the label when the control prefixes', () => {
		expect(optionText('Target', { value: 'de', label: 'German' }, true)).toBe('Target: German');
	});

	it('renders the bare value when the control does not prefix', () => {
		expect(optionText('Scope', { value: 'page', label: 'Page' }, false)).toBe('Page');
	});

	it('prefixes a disabled option the same way — prefixing is independent of disabled', () => {
		const option = { value: 'ja', label: 'Japanese', disabled: true };
		expect(optionText('Target', option, true)).toBe('Target: Japanese');
		expect(optionText('Target', option, false)).toBe('Japanese');
	});

	it("keeps a colon in the option's own label verbatim", () => {
		expect(optionText('Sort', { value: 'x', label: 'Ratio: 2:1' }, true)).toBe('Sort: Ratio: 2:1');
		expect(optionText('Sort', { value: 'x', label: 'Ratio: 2:1' }, false)).toBe('Ratio: 2:1');
	});
});
