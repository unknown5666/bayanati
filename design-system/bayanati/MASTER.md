# Bayanati — Design System (Master)

Over Exposure Productions · crew intake & contract automation
Stack: **Next.js 14 (App Router) + Tailwind CSS 3**

> Source of truth for visual decisions. Tokens live in `tailwind.config.ts`;
> composable classes live in `src/app/globals.css` under `@layer components`.
> Nothing in a component should need a raw hex value.

---

## 1. Concept

**Cinematic dark.** The company name is the brief: a blown-out highlight
against deep shadow. Surfaces are steps on a warm-tinted ink ramp, lit by two
soft sources bleeding in from the top corners — exposure amber on the left,
logo maroon on the right — with a whisper of film grain over everything so
large dark washes read as *shot* rather than *drawn*.

One accent, used sparingly: amber marks the single most important action on
any given screen and nothing else.

## 2. Colour

| Token | Value | Use |
|---|---|---|
| `ink-950` | `#0a0a0b` | Page ground |
| `ink-900` / `ink-850` | `#111113` / `#161619` | Card and field surfaces |
| `ink-800` / `700` / `600` | — | Borders, dividers, hover fills |
| `ink-400` | `#8b8b96` | Lowest text-safe grey (placeholders) — 5.8:1 |
| `exposure` | `#e8b04b` | Hero accent, focus rings — 9.3:1 |
| `brand` | `#8e1f3f` | **Surfaces/fills only** — 2.3:1, never text on dark |
| `brand-bright` | `#e05572` | Text-safe maroon — 5.4:1 |
| `ok` / `warn` / `danger` / `info` | — | Semantic status, all text-safe |
| `paper` | `#f6f5f2` | Primary text; the signature pad's surface |

**Text opacity ramp** (against `ink-950`), and the floors that go with it:

| Role | Opacity | Contrast |
|---|---|---|
| Primary | `paper` | 18:1 |
| Body | `paper/[0.82]` | ~12:1 |
| Muted (secondary copy, labels) | `paper/[0.72]` | ~8.4:1 |
| Subtle (meta, captions) | `paper/[0.55]` | ~5.9:1 |

**Nothing informational goes below 55%.** The pre-existing `paper/40`,
`paper/45` and `ink-500`-on-dark treatments all failed AA and were raised.

Status is never carried by colour alone — every badge and alert pairs its
colour with an icon and a word.

## 3. Typography

- **Inter** (Latin, variable) / **Cairo** (Arabic). Arabic copy picks up the
  Arabic face automatically via `:lang(ar), [dir='rtl']`.
- Display sizes use `.text-display` (`font-bold` + `-0.03em` tracking) — tight
  tracking is what separates a title from a heading.
- `.text-flare` applies the amber→maroon gradient wash to hero words.
- `.nums` (tabular figures) on every stat, amount, IBAN and reference, so
  numbers stay aligned as they change.
- Body minimum 16px; `maximum-scale` is **5**, pinch-zoom enabled.

## 4. Spacing, radius, elevation

- Spacing rhythm: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px (density: standard).
- Radius: `xl` 0.9rem (fields, buttons), `2xl` 1.25rem (cards), `3xl` 1.75rem.
- Elevation ramp: `shadow-soft` → `shadow-lift` → `shadow-float`, plus
  `shadow-flare` / `flare-lg` — the amber bloom reserved for primary actions.
- `.card` carries a hairline top highlight (`::before`) that sells "lit from
  above" and separates stacked cards without a heavy border.

## 5. Motion

Entrances ease out with slight overshoot (`cubic-bezier(0.16, 1, 0.3, 1)`);
exits are shorter and sharper. Durations 120 / 200 / 320 ms.

`fade-in`, `rise-in`, `scale-in`, `sheet-up`, `shimmer`, `pulse-ring`.

Motion only ever conveys meaning: step advancement, sheet direction, loading,
and the halo on the current form step. **`prefers-reduced-motion` collapses
every animation and transition globally** — state changes still resolve, just
instantly.

## 6. Components

| Class | Notes |
|---|---|
| `.btn` + `-primary` / `-ghost` / `-quiet` / `-danger` | 44px min tap target, press-down at 150ms |
| `.btn-sm` / `.btn-icon` | Compact (36px) / square icon-only — always needs `aria-label` |
| `.card` / `.card-interactive` / `.panel` / `.panel-row` | Surfaces |
| `.field-input` / `-error`, `.field-label`, `.field-error`, `.field-hint` | Forms |
| `.chip`, `.segmented` + `.segmented-item` | Status and view switching |
| `.alert` + `-ok` / `-error` / `-info`, `.skeleton` | Feedback |

Primitives in `src/components/ui/`: `Icon`, `Spinner`, `Skeleton`, `Alert`,
`Segmented`.

## 7. Accessibility rules (non-negotiable)

1. **No emoji as icons.** Emoji render differently per platform, cannot be
   recoloured, and are read aloud by screen readers mid-label. Use `<Icon>`
   — a 24px-grid stroke set that inherits `currentColor` and is `aria-hidden`,
   so the button's own words remain its accessible name.
2. **Focus is always visible** — a 2px amber `:focus-visible` outline. Never
   removed.
3. **44×44 minimum** for anything tappable. Checkboxes stay 18px visually but
   get a 44px hit area from a wrapping label.
4. **Pinch-zoom stays enabled.**
5. **Visible labels**, never placeholder-as-label. Errors sit next to their
   field, wired via `aria-describedby`, announced with `role="alert"`.
6. **Modals** trap Tab, restore focus to the trigger on close, and lock
   background scroll.
7. **No horizontal page scroll** at any width. Only tables scroll sideways,
   inside their own container.
8. Icon-only buttons (including labels that collapse on mobile) carry
   `aria-label`.

## 8. Base-layer caveat

Element-level rules in `globals.css` are wrapped in `@layer base` deliberately.
Written unlayered they sit after Tailwind's output in source order and beat
every utility of equal specificity — `[dir='rtl'] { text-align: right }` would
silently win over a `text-left` on an Arabic caption. Keep them in the layer.

## 9. Provenance

The `ui-ux-pro-max` skill's searchable database (styles/palettes/font pairings)
was **not available in this environment** — only its `SKILL.md` synced. These
recommendations therefore follow the skill's priority framework
(accessibility → touch → performance → style → layout → type/colour → motion →
forms → navigation) applied by hand, and are **not** database matches. Contrast
figures above were computed directly against WCAG 2.1 relative luminance.
