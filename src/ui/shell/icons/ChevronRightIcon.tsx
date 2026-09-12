/**
 * icon.16.chevron.right — UI3 published library component
 * key: af9f3d00455a37f1c1dcba495ad583eaac59d17f (node 265:847 in UlcEw6zdZzpIpxqrBz4X53 — the
 * `Export ▸` link's disclosure in the Extract summary bar)
 * Path is Figma's own exported SVG. Figma flattens the bound `text/brand` paint to a literal blue on
 * export; it is swapped for currentColor so the token drives it from CSS and dark mode keeps
 * working, per docs/specs/LS-5.md §2.6.
 *
 * 16px, not 24: design.md records the export link's disclosure as `icon.16.chevron.right`, and it
 * sits inside a 2px auto-layout wrapper beside the label so the icon tokenises independently of it.
 * The chevron binds `text/brand` rather than `icon/secondary` — it is part of the link, not neutral
 * chrome (design.md, Composite labels).
 */
export function ChevronRightIcon(props: { className?: string }) {
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
				d="M6.76777 6.23223C6.5725 6.03697 6.5725 5.72039 6.76777 5.52512C6.96303 5.32986 7.27961 5.32986 7.47487 5.52512L9.94974 8L7.47487 10.4749C7.27961 10.6701 6.96303 10.6701 6.76777 10.4749C6.5725 10.2796 6.5725 9.96303 6.76777 9.76777L8.53553 8L6.76777 6.23223Z"
				fill="currentColor"
			/>
		</svg>
	);
}
