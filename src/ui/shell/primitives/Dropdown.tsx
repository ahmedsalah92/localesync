import { ChevronDownIcon } from '../icons/ChevronDownIcon';

export interface DropdownOption {
	value: string;
	label: string;
	/** Renders a disabled `<option>`. Used to show the languages the engine refuses rather than
	 *  hiding them — the menu is not the enforcement, `isUnsupportedLanguage` is (LS-8.2 §2.2). */
	disabled?: boolean;
	/** Groups consecutive options under an `<optgroup>` of this name. */
	group?: string;
}

/**
 * Renders as a native `<select>` so the open option list is OS-rendered — sidesteps needing to
 * style a custom popover (and the `bg/menu/default` token that has no live binding, see
 * docs/specs/LS-5.md §3.2). Only the closed/trigger chrome is styled. `disabled` and `group` are
 * free for the same reason: the platform draws them.
 *
 * Two treatments, one control (LS-8.2 §1.6, following design.md's canvas component
 * `Dropdown, Stroke=False`): bordered for the control bar's scan inputs, borderless for the summary
 * bar's Show/Sort. The alternative was two hand-built lookalikes.
 */
export function Dropdown(props: {
	label: string;
	value: string;
	options: readonly DropdownOption[];
	onChange: (value: string) => void;
	/** Default true. False = the borderless summary-bar treatment. */
	stroke?: boolean;
	/** Default true. False = a bare value, for the control-bar selects whose meaning is positional. */
	prefixLabel?: boolean;
	/** Default false (hug). True = fill the available width. */
	fill?: boolean;
	disabled?: boolean;
	/** Accessible name, when the visible prefix is shorter than the name a screen reader needs.
	 *  Defaults to `label`. */
	ariaLabel?: string;
}) {
	const stroke = props.stroke ?? true;
	const prefixLabel = props.prefixLabel ?? true;
	const fill = props.fill ?? false;

	return (
		<div
			style={{
				position: 'relative',
				display: fill ? 'flex' : 'inline-flex',
				alignItems: 'center',
				height: 24,
				flex: fill ? '1 1 auto' : undefined,
				minWidth: 0,
			}}
		>
			<select
				aria-label={props.ariaLabel ?? props.label}
				value={props.value}
				disabled={props.disabled}
				onChange={(e) => props.onChange(e.target.value)}
				style={{
					appearance: 'none',
					width: fill ? '100%' : undefined,
					minWidth: 0,
					height: 24,
					padding: `0 var(--spacer-4) 0 var(--spacer-2)`,
					// design.md binds Radius/radius-small to "Control Bar selects and the Scan button".
					// This read `--radius-medium`, a straight code-vs-canvas defect (LS-8.2 §1.6).
					borderRadius: 'var(--radius-small)',
					border: stroke ? '1px solid var(--ls-border-default)' : '1px solid transparent',
					backgroundColor: stroke ? 'var(--ls-bg-default)' : 'transparent',
					color: 'var(--ls-text-default)',
					fontSize: 'var(--ls-text-size)',
					lineHeight: 'var(--ls-text-line)',
					letterSpacing: 'var(--ls-text-tracking)',
					fontWeight: 'var(--ls-text-weight)',
					opacity: props.disabled === true ? 0.4 : 1,
					cursor: props.disabled === true ? 'default' : 'pointer',
					textOverflow: 'ellipsis',
				}}
			>
				{renderOptions(props.options, props.label, prefixLabel)}
			</select>
			<span
				style={{
					position: 'absolute',
					right: 'var(--spacer-1)',
					top: '50%',
					transform: 'translateY(-50%)',
					pointerEvents: 'none',
					color: 'var(--ls-icon-secondary)',
					width: 16,
					height: 16,
					// Flex-centred so this 16px box is honoured whatever the icon's intrinsic width/height
					// attributes say — without it an oversized SVG anchors top-left and overhangs the control.
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<ChevronDownIcon />
			</span>
		</div>
	);
}

/** The text a single `<option>` renders: `label: value` when the control prefixes, bare otherwise. */
export function optionText(label: string, option: DropdownOption, prefixLabel: boolean): string {
	return prefixLabel ? `${label}: ${option.label}` : option.label;
}

/** Consecutive options sharing a `group` render inside one `<optgroup>`; ungrouped ones stay flat. */
function renderOptions(options: readonly DropdownOption[], label: string, prefixLabel: boolean) {
	const groups: { group: string | undefined; options: DropdownOption[] }[] = [];

	for (const option of options) {
		const last = groups[groups.length - 1];
		if (last !== undefined && last.group === option.group) last.options.push(option);
		else groups.push({ group: option.group, options: [option] });
	}

	return groups.map((entry, index) => {
		const items = entry.options.map((option) => (
			<option key={option.value} value={option.value} disabled={option.disabled}>
				{optionText(label, option, prefixLabel)}
			</option>
		));
		if (entry.group === undefined) return items;
		return (
			<optgroup key={`${entry.group}-${index}`} label={entry.group}>
				{items}
			</optgroup>
		);
	});
}
