# LS-6 — Export: JSON / iOS `.strings` / Android XML

**Epic:** Features · **Complexity:** Med · **Blocked by:** LS-9, LS-18, LS-24 · **Blocks:** LS-14

Serialize the LS-9 keyed list to three formats — i18next JSON, iOS `.strings`, Android
`strings.xml` — and hand the file to the user from the iframe. Pure, DOM-free string work plus one
download; nothing crosses the bridge.

The governing policy is **preserve, never generate**: interpolation and plural markers already in a
string survive byte-identical, and the exporter never invents, normalises or renames one. Everything
below follows from that plus per-format validity.

API pins: **`docs/agent-guidelines.md` §2**, and §1 for the main bundle's ES2017 floor. Conventions:
§1, §4, §6. Not repeated here.

---

## §0 Scope

In scope: the three serializers, per-format escaping, the key remapping Android requires, the
optional dedup transform, deterministic output, and the download. The export sub-surface itself is
designed under LS-24 (a 400px UI3 Modal opened from the `Export ▸` link in the Extract summary bar)
and built here.

Out of scope, all Phase 2: CSV / XLIFF / XLSX / YAML, CI and repo-sync handoff, import round-trip
(LS-12 owns import), and placeholder or plural **generation**.

### The Gleef anchor — what it is and is not

LS-18 requires the goldens' structure and escaping to be anchored to a real Gleef export rather than
hand-typed, so that a wrong golden and a wrong exporter cannot agree and both pass. That run happened
(2026-09-12, `fixtures/export-cases.fig` → Gleef → Android XML + CSV). **It anchors less than the
issue assumes, and the gap is recorded here rather than papered over.**

Gleef rewrote or dropped **11 of the 42 cases**:

| Cases | Sent | Gleef emitted |
|---|---|---|
| 16, 17, 24 | `{{count}}`, `{{name}}` | `{count}`, `{name}` |
| 18, 19, 20 | `%@`, `%1$s`, `{0}` | `{value}` — all three collapsed |
| 22 | `%1$s got 50% off` | `{recipient_name} got 50% off` — an invented semantic name |
| 5 | `C:\Users\name` | `{value}` — the value destroyed |
| 7, 31, 32 | real newline, empty, whitespace-only | dropped entirely |

Gleef normalises placeholder syntax and guesses intent. That is exactly what this issue forbids, so
**on these cases LocaleSync deliberately does not match Gleef.** "Drop-in against Gleef" holds for
file shape and literal-character escaping; it does not extend to content fidelity, where LocaleSync
is strictly better.

**Anchored from Gleef (authoritative):** XML entity escaping including the `&amp;` → `&amp;amp;`
case; `"` and `'` left raw in XML text; `%` left bare; tab, trailing space and U+2028 preserved; no
Unicode normalisation (`Cafe`+U+0301 and `Caf`+U+00E9 came back distinct); the XML declaration,
`<resources>` root, 2-space indent, absence of a BOM and absence of a trailing newline; nested JSON
shape with 2-space indent (from the earlier single-string export).

**Three gaps, recorded on LS-18 as scoped exceptions rather than silently-met criteria:**

1. **No iOS anchor exists.** Gleef offers no `.strings` export. §2.3 derives it from Apple's format —
   and then verifies every rule against `plutil`, which more than compensates: iOS ends up the
   best-evidenced of the three formats, checked against Apple's own parser rather than against a
   competitor's output.
2. **No JSON anchor beyond structure.** Gleef's JSON export fails on this case set with
   `Cannot use 'in' operator to search for 'line_a_b' in &amp; is how you write an ampersand` — its
   nested-object builder hit a leaf where it expected a branch, among its own content-derived keys.
   JSON escaping is unambiguous anyway (RFC 8259; i18next just calls `JSON.parse`), so the cost is
   confined to the collision rule, which §2.1.2 decides in-house.
3. **Android anchored for escaping only, never for keys.** Gleef derives keys from text *content* —
   `line_a_b` came from the value `Line A\nLine B`, on a layer named `escape_token`. LS-9 rule 1
   derives from `model.name` and never from `characters`, precisely so a copy edit cannot change a
   key. The two schemes are incompatible, not variants, so every Gleef key and `name=` attribute is
   ignored here.

---

## 1. Contracts

### 1.1 Consumed — referenced, never redefined (§4)

| Type / value | Owner | Module |
|---|---|---|
| `ExtractedString` | LS-9 | `src/common/models.ts` |
| `occurrenceCounts` | LS-9 | `src/ui/extract/state.ts` |
| `ResultsRow`, `Dropdown`, `Button`, `StateView` | LS-5 | `src/ui/shell` |

`drifted` is not an export input: it describes the key's relationship to its layer name, which has no
bearing on serialization. `nodeId` is carried only so `keyMap` can name a node.

**Nothing crosses the bridge.** `docs/specs/LS-2.md` §303 settles this: there is no
`export-request` / `export-result`. The UI already holds `ExtractedString[]` from
`extraction-result`, serialization is pure and DOM-free, and the download needs the DOM the main
thread lacks. This spec does not reopen it.

### 1.2 Upstream amendment this issue requires

**LS-9 must treat a prefix collision as a collision.** LS-9 rule 6 guarantees keys are *unique*, but
uniqueness does not prevent one key being a strict prefix of another: `home.title` and
`home.title.sub` are distinct keys and both legal today. Under the `dot` scheme those two are
mutually unrepresentable in nested JSON — `home.title` must be either a string or an object, and
i18next's `t('home.title')` walks the same path either way.

Per §4 the fix belongs upstream, not in a local workaround: **LS-9's uniqueness check should reserve
a key's ancestors as well as the key itself**, so the second node to claim `home.title(.sub)` is
suffixed at derivation time and the conflict never reaches export. Until that lands, §2.1.2 defines
what export does with it.

### 1.3 Owned by LS-6

```ts
// src/ui/export/types.ts
export type ExportFormat = 'json' | 'ios' | 'android';

export interface ExportOptions {
	format: ExportFormat;
	/** Collapse identical values to one shared key. Default false (§2.4). */
	dedup: boolean;
}

export interface ExportResult {
	/** The file's exact bytes, as text. */
	content: string;
	filename: string;
	mimeType: string;
	/**
	 * Keys the exported file does not carry verbatim, and why. Populated ONLY where a
	 * transform or a format constraint forced it — empty in the common case (§2.5).
	 */
	keyMap: KeyMapEntry[];
	/** Keys omitted from the file entirely, with the reason (§2.1.2). Empty in the common case. */
	omitted: OmittedEntry[];
}

export interface KeyMapEntry {
	nodeId: string;
	/** The LS-9 key. */
	from: string;
	/** What the file actually carries. */
	to: string;
	reason: 'android-remap-collision' | 'dedup';
}

export interface OmittedEntry {
	nodeId: string;
	key: string;
	reason: 'json-prefix-collision';
}

export function serialize(entries: readonly ExtractedString[], options: ExportOptions): ExportResult;
```

One entry point per §4's ownership rule; the three format serializers are internal to
`src/ui/export/`.

---

## 2. Resolved Defaults

### 2.1 i18next JSON

1. **Nested**, splitting keys on `.` — Gleef-anchored, and i18next's default `keySeparator` is `'.'`,
   so a flat map would need consumer configuration to work at all. `checkout.summary.total` →
   `{"checkout":{"summary":{"total":"…"}}}`.
2. **Prefix collisions are omitted, never silently resolved.** When a key is both a leaf and a branch
   (`home.title` alongside `home.title.sub`), the **branch wins**: the deeper keys nest normally and
   the shorter key is left out of the file and reported in `ExportResult.omitted`.
   *Rationale:* every available option loses something, because i18next cannot represent both. Of the
   options, this is the only one that is (a) deterministic regardless of input order — last-writer-wins
   is not, (b) lossless for the strictly greater number of strings, and (c) **visible**, so the UI can
   tell the user which string did not make it. Suffixing the leaf was rejected: inventing a key is
   generation, and it would not match the key LS-9 stamped on the node. The real fix is §1.2.
3. Escaping is `JSON.stringify`'s: `"` → `\"`, `\` → `\\`, control characters to their short escapes.
   **Non-ASCII stays literal UTF-8** — no `\u` escaping — so Arabic, CJK and emoji read as themselves.
4. **2-space indent** (Gleef-anchored), LF newlines, **no BOM, no trailing newline**.
5. Key order within each object follows §2.6.

### 2.2 Android `strings.xml`

Gleef's Android output parses as XML but is not a buildable Android resource file: all 39 resource
names contain dots, two values carry raw apostrophes, two begin `@` / `?`, and one keeps a trailing
space. **LS-6 emits Android that builds, and each divergence is listed with its reason.** This
satisfies LS-18's toolchain criterion; it is why the Gleef-anchor criterion reads "anchored where
Gleef is correct".

6. Envelope: `<?xml version="1.0" encoding="utf-8"?>` then `<resources>`, one `<string>` per entry at
   **2-space indent**, **no BOM, no trailing newline** — all Gleef-anchored.
7. **Value escaping, Gleef-anchored:** `&` → `&amp;` **always**, including inside a literal that
   already looks like an entity, so `&amp; is…` correctly becomes `&amp;amp; is…`. `<` → `&lt;` and
   `>` → `&gt;` — both, though `>` is optional in XML text.
8. **Value escaping, diverging from Gleef** (each required by Android, each left raw by Gleef):
   **`\` → `\\`**; `'` → `\'`; `"` → `\"`; a leading `@` or `?` → `\@` / `\?`, since Android reads
   those as resource and theme-attribute references.
   **The backslash rule is not optional and its position in the order is load-bearing.** Android
   applies its own escape pass after XML parsing, so an unescaped backslash is read as the start of
   an escape sequence: `C:\Users\name` (#5) comes back as `C:\Users` + a newline + `ame`, and
   `Line A\nLine B` (#6) — a literal backslash-n — comes back as a real newline. Both were caught by
   the §3.3 golden round-trip, not by review.
8a. **Escaping order, normative:** XML entities (§2.2.7) → `\` → `\\` → `'` and `"` → newline and tab
    (§2.2.9a) → leading `@`/`?` → quote-wrap (§2.2.9). Backslash must be escaped **before** any rule
    that introduces one, or `\'` and `\n` get double-escaped into literal text; and **after** the XML
    entities, which introduce none.
9. **Values with leading or trailing whitespace are wrapped in `"…"`** — Android trims unquoted
   values, so #32 (`'   '`) and #36 (`'Save '`) would otherwise change meaning. Diverges from Gleef,
   which preserves the space unquoted and loses it at build time.
9a. **Interior newline → `\n`, interior tab → `\t`.** Android collapses runs of whitespace inside an
    unquoted value, so a literal newline (#7) or tab (#8) written raw does not survive the build.
    Escape sequences are used rather than extending the §2.2.9 quoting, because they are what an
    Android developer expects to read in a resource file, and because quoting a multi-line value
    hides the line structure. **Diverges from Gleef, which emitted a raw literal tab for #8** — one
    more case where Gleef produces valid XML that is not a faithful Android resource.
9b. **U+2028 stays literal.** It is not ASCII whitespace, so Android's collapsing rule does not
    reach it, and it has no escape sequence. Verified present in Gleef's own output for #9.
10. **`%` is never doubled.** Gleef-anchored *and* forced by preserve-not-generate: rewriting `%` to
    `%%` would corrupt `%1$s` and `%@`, which §0 requires to survive byte-identical.
10a. **A value carrying two or more `%` takes `formatted="false"` on its `<string>`.** aapt2 rejects
    `%1$s got 50% off` (#22) outright — *"multiple substitutions specified in non-positional format"*
    — so without this the file does not compile and LS-18's toolchain criterion cannot be met.
    `formatted="false"` is an **attribute, not a content change**: the value stays byte-identical, so
    this buys aapt2 compatibility without touching preserve-not-generate. Applied only where the
    rule would trip — a single `%`, positional or not, compiles fine and takes no attribute.
    *Found by the §3.3 aapt2 run. The earlier draft of this rule called `formatted="false"` the
    consuming project's business — which was wrong: it produced a resource file that does not build,
    and "the consumer can fix it" is not a standard an export feature gets to hold itself to.*
11. **Resource-name remapping.** Android names must match `[a-zA-Z][a-zA-Z0-9_]*`, so every `dot` key
    remaps: `.` → `_`. LS-9 rule 2 anticipates this — underscore is inside the Android safe set, so
    segments themselves need no further remapping, and the `snake` scheme exports unremapped.
12. A remapped name not beginning with a letter is prefixed **`key_`** (`2024.summary` →
    `key_2024_summary`). Bare truncation or dropping the digit would collide across inputs.
13. **`keyMap` records remapping collisions only** — LS-9's carry-forward is explicit that under
    `dot` every key remaps, so a fully-populated map traces nothing. `nav.item_2` and `nav.item.2`
    both remap to `nav_item_2`; the **first in document order keeps it**, later ones take `_2`, `_3`,
    and only those get a `keyMap` entry.

### 2.3 iOS `.strings`

No Gleef anchor exists (§0 gap 1), so this derives from Apple's format — and is then **verified
against Apple's own parser**, which makes it the best-evidenced of the three despite having no Gleef
export behind it. Every rule below was confirmed on 2026-09-12 by writing a probe file and running
`plutil -lint` (OK) plus a `plutil -convert json` round-trip: dotted keys, a raw apostrophe, `\"`,
`\\`, `\n`, `\t`, `%@`, `%1$s`, `%1$s got 50% off`, an empty value, a whitespace-only value, a
trailing space, U+0301 and U+2028 all survive byte-identical, and `&` / `<` / `>` need no escaping.

14. One entry per line: `"key" = "value";`. LS-9 keys are used **verbatim** — dots are legal in
    `.strings` keys, so no remapping and no `keyMap` entries.
15. Escaping: `\` → `\\`, `"` → `\"`, newline → `\n`, carriage return → `\r`, tab → `\t`. Every other
    character stays literal UTF-8.
16. **UTF-8, no BOM** — **verified**: `plutil -lint` accepts the probe file, which is UTF-8 with no
    BOM. Apple's older documentation specifies UTF-16; modern tooling reads UTF-8 correctly, and UTF-8
    keeps all three formats on one encoding.
17. No comments and no header. LF newlines, no trailing newline, matching the other two.

### 2.4 Dedup

18. Grouping is **exact value equality** — the same rule `occurrenceCounts` already implements, so the
    `N×` marker on an Extract row predicts exactly what dedup collapses. No trimming, no case folding
    and **no Unicode normalisation**: #29 and #30 render identically but are different strings and
    must not merge. #36 (`'Save '`) stays out of the `'Save'` group on one trailing space.
19. **Default off.** Identity stays per-node (decision #3).
20. **The survivor is the first member in document order** — the order of the incoming
    `ExtractedString[]`, which is canvas order. Deterministic and independent of `Map` iteration.
21. Collapsed keys get a `keyMap` entry with `reason: 'dedup'`, so preview and write-back can trace a
    shared key back to the nodes behind it.
22. Dedup **never** touches on-canvas node identity, plugin data, or the Extract list.

### 2.5 Empty and whitespace-only values

23. LS-9 excludes empty nodes from extraction, so `value === ''` should not reach export. It is
    **emitted anyway if it does** — an empty string is a legitimate translation unit, and Gleef's
    choice to drop empty and whitespace-only entries is one of the 11 mutations this spec rejects.
24. Whitespace-only values are emitted and, for Android, quoted per §2.2.9.

### 2.6 Determinism

25. **Output order is input document order**, never sorted. Reproducible, and it matches the order the
    user sees in the Extract list. Nested JSON objects are built in first-appearance order of each
    path segment.
26. Byte-for-byte reproducibility is a hard requirement: the same `ExtractedString[]` and the same
    `ExportOptions` must produce identical bytes, since §3 diffs against goldens.

### 2.7 Download

27. UI-local: a `Blob` plus a programmatic `<a download>` click, per §1.1.
28. Filenames and MIME types: JSON `translations.json` / `application/json`; iOS `Localizable.strings`
    / `text/plain`; Android `strings.xml` / `application/xml`.
29. **Verify the download actually fires from the plugin iframe before closing this issue.** The
    iframe is sandboxed and a blocked download would fail silently. If it is blocked, the fallback is
    a copy-to-clipboard action on the same modal — not a redesign.

### 2.8 Large exports

30. Single-pass string building, no chunking. At Phase-1 scale — LS-15's advisory bound is ~500 nodes,
    and `large-file.fig` is ≈1500 — the whole file is far below any size that needs streaming. Stated
    so the absence of chunking is a decision rather than an oversight.

### 2.9 Reconciliations carried from LS-9

31. **Parrot → Gleef** throughout: Parrot is the predecessor name.
32. **`TRUNCATE` is a live `textAutoResize` value** per LS-8.1 and agent-guidelines §2 — an earlier
    LS-6 draft treated it as legacy. It has no bearing on export, but the draft's claim is corrected
    here rather than left to propagate.
33. **Dedup is decision #3, not #5.** The Linear issue body says #5; LS-9 §8 says #3. The issue text
    is wrong. #5 is the decision to keep the three formats as one issue.
34. **LS-6 restores the `Export ▸` link** that LS-9 §2.35 deliberately omitted rather than ship a
    control that did nothing. It now has a surface to open.

---

## 3. Concrete Acceptance

### 3.1 Pure unit tests — `npm test`

| File | Covers |
|---|---|
| `src/ui/export/json.test.ts` | nesting, the §2.1.2 prefix-collision omission, `JSON.stringify` escaping, literal UTF-8 |
| `src/ui/export/ios.test.ts` | line shape, §2.3.15 escaping, keys verbatim |
| `src/ui/export/android.test.ts` | §2.2.7–8 escaping, the whitespace quoting rule, `%` untouched, name remapping and the `key_` prefix, collision `keyMap` |
| `src/ui/export/dedup.test.ts` | exact-value grouping, survivor order, `keyMap`, #29/#30 not merged, #36 not merged |
| `src/ui/export/golden.test.ts` | byte-for-byte diff of all three formats against `fixtures/expected/` |
| `src/ui/export/ExportModal.test.ts` | the sub-surface mounts and carries every control LS-24 specifies; dedup defaults off; the close affordance is an icon, not a glyph |

### 3.2 The case set

`fixtures/export-cases.json` — 42 keyed strings, the input to every test above. Authored ahead of this
spec because it was the input fed through Gleef; now that this spec exists, **this spec is the
authority and the fixture is its transcription** (§6), matching how `extract-cases.json` relates to
LS-9 §3.2.

`src/main/devtools/generateExportCases.ts` builds the set as text layers on a canvas (the
**Generate export-cases** dev button) so Gleef can be run over it, and reads every node back to catch
a value Figma altered on write. `generateExportCases.test.ts` diffs its transcription against the
fixture on every `npm test`, so the canvas and the case set cannot drift.

### 3.3 Goldens — `fixtures/expected/`

One golden per format, derived from §2 and diffed byte-for-byte. **Each must be hand-verified to parse
in a real toolchain** (LS-18 criterion 3):

| Golden | Verified by |
|---|---|
| `expected/translations.json` | `JSON.parse`, plus an i18next lookup of a nested key |
| `expected/strings.xml` | `fast-xml-parser`, **and a real aapt2 compile + link** — `npm run check:android` |
| `expected/Localizable.strings` | `plutil -lint`, plus a `plutil -convert json` round-trip — **available and already exercised** (§2.3) |

**The aapt2 run is done, and it was load-bearing** (2026-09-12, aapt2 2.20-15703166). It needs no
Android SDK: Google publishes aapt2 as a standalone ~4MB Maven artifact with no licence acceptance,
and `scripts/check-android-golden.mjs` prints the exact commands when it cannot find one. The script
compiles, links, then reads the strings back out of Android's own string pool and compares them to
`export-cases.json` — decoding the CESU-8 surrogate pairs aapt2 dumps, or every astral character
would read as a mismatch. Run it with `npm run check:android`; it skips loudly rather than failing
when aapt2 is absent, so `npm test` stays runnable everywhere.

**Result: all 42 values survive compilation byte-identical** — backslashes, a literal backslash-n, a
real newline and tab, U+2028, the ZWJ emoji sequence, and precomposed vs combining `Café` kept
distinct. `<string>` count in the pool is 40 rather than 42 because Android pools the three
identical `Save` values.

It caught two defects nothing else could see:

1. **Gleef's own export fails to compile** — *"unescaped apostrophe in string"*. That is the
   evidence justifying every §2.2.8 divergence, which until then rested on a documented rule rather
   than an observed rejection.
2. **Our first golden failed too**, on `%1$s got 50% off` — which produced §2.2.10a. Well-formed XML
   and a clean `fast-xml-parser` round-trip said nothing about it.

### 3.4 Run

```
npm test                       # unit + golden diffs
npx tsc -b && npx eslint .     # green, per agent-guidelines §1
npm run build                  # check:dist — no dev sentinel, ES2017 holds
```

Then in Figma under `npm run dev`: extract on `export-cases.fig`, open `Export ▸`, and download each
format — §2.7.29 is not provable under Vitest.

---

## 4. API pins

`docs/agent-guidelines.md` §2. Export touches no Figma API beyond what LS-9 already returns; the
download is DOM, not plugin API.

---

## Carried forward

- **LS-9:** the §1.2 prefix-collision amendment. Until it lands, `ExportResult.omitted` is reachable
  and the UI must surface it.
- **LS-14:** copy for the omitted-key and `keyMap` disclosures, and for the dedup toggle's help text.
  §2.1.2 and §2.2.13 both produce user-visible outcomes with no words yet.
- **LS-18:** the three §0 gaps are scoped exceptions on its fourth criterion, not silent passes. Its
  third criterion now explicitly includes the aapt2 run.
- **LS-12:** Gleef's CSV is RFC 4180 with doubled quotes (`"He said ""hi"""`), a `key,en-US` header
  and CRLF line endings — recorded here because the import side will need it and this is where the
  observation was made.
- **Consider wiring `check:android` into CI.** It is opt-in today because aapt2 is not an npm
  dependency, which means a future edit to the Android rules can regress the golden and only
  `npm test`'s byte-diff will notice — and that diff would be updated alongside the change. The
  aapt2 run is the only check that would catch the file no longer building.
