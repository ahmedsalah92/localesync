/**
 * icon.16.chevron.down — UI3 published library component
 * key: ff0c4fdf34401994a32ade80aafcabf167ca17d8 (docs/design.md § Icon components: "Language
 * select, scope select, Show filter, Sort")
 *
 * Geometry is this repo's own `icon.16.chevron.right` export (key
 * af9f3d00455a37f1c1dcba495ad583eaac59d17f) rotated a quarter turn about the 16px box centre —
 * one mark at four rotations, and the same derivation the design file used to build
 * `icon.16.chevron.left (local)` from that chevron. Rotating in the SVG rather than transcribing
 * fresh path data keeps this traceable to a real UI3 export.
 *
 * Replaces `icon.24.chevron.down`, which was the wrong kit component and drew in a 24-box inside a
 * 16px wrapper: the intrinsic attributes won, so the caret sat 4px low and overhung the control's
 * right border.
 *
 * The paint attribute is `currentColor` so the `icon/*` colour tokens drive it from CSS, per
 * docs/specs/LS-5.md §2.6.
 */
export function ChevronDownIcon(props: { className?: string }) {
	return (
		<svg
			className={props.className}
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			aria-hidden="true"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				transform="rotate(90 8 8)"
				d="M6.76777 6.23223C6.5725 6.03697 6.5725 5.72039 6.76777 5.52512C6.96303 5.32986 7.27961 5.32986 7.47487 5.52512L9.94974 8L7.47487 10.4749C7.27961 10.6701 6.96303 10.6701 6.76777 10.4749C6.5725 10.2796 6.5725 9.96303 6.76777 9.76777L8.53553 8L6.76777 6.23223Z"
				fill="currentColor"
			/>
		</svg>
	);
}
