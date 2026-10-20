# IGNIS Docs - Design System

The single source of truth for how the IGNIS documentation site looks. Every value is
grounded in an established standard, not chosen by feel. Tokens live in
[`site/.vitepress/theme/design-tokens.css`](./site/.vitepress/theme/design-tokens.css)
and are applied live in the VitePress theme (`site/.vitepress/theme/style.css`).

## Principles

| Axis | Standard | Value |
| --- | --- | --- |
| Body size | Browser default / longform readability | **16px** base |
| Type scale | Modular scale - Major Third (Material Design) | **ratio 1.25** |
| Spacing | 8-point grid + 4px half-step | `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96` |
| Contrast | WCAG 2.1 AA | **4.5:1** normal · **3:1** large/UI |
| Measure | Bringhurst / Baymard (50-75 CPL, 66 ideal) | prose **≤ 70ch** |
| Line-height | Readability for ~70ch lines | body **1.6**, headings 1.15-1.3 |
| Alignment | Constant left edge aids reading | left-aligned prose |

## Type scale (16 × 1.25ⁿ)

| Token | px / rem | line-height | Use |
| --- | --- | --- | --- |
| `--ig-fs-hero` | 61 / 3.8125 | 1.05 | Hero headline (desktop) |
| `--ig-fs-display` | 49 / 3.0625 | 1.1 | Big marketing display |
| `--ig-fs-h1` | 39 / 2.4375 | 1.15 | Page title |
| `--ig-fs-h2` | 31 / 1.9375 | 1.2 | Section heading |
| `--ig-fs-h3` | 25 / 1.5625 | 1.25 | Subsection |
| `--ig-fs-h4` | 20 / 1.25 | 1.3 | Card / minor heading |
| `--ig-fs-lede` | 18 / 1.125 | 1.6 | Intro paragraph |
| `--ig-fs-body` | 16 / 1 | 1.6 | **Base body / docs prose** |
| `--ig-fs-sm` | 14 / 0.875 | 1.5 | Secondary, tables, inline code |
| `--ig-fs-caption` | 12 / 0.75 | 1.4 | Labels, captions, badges |

## Color - WCAG-verified

Brand anchor is **`#AF5F5F`** (rose). Contrast measured with the WCAG 2.1 formula
against the dark background `#0B0A0C`.

| Token | Hex | Contrast (dark bg) | Rating | Use |
| --- | --- | --- | --- | --- |
| `text` | `#EDE7EA` | 16.2:1 | AAA | Body, headings |
| `text-2` | `#B4ABB0` | 8.84:1 | AAA | Secondary body, lede |
| `text-3` | `#8C828A` | 5.34:1 | AA | Smallest readable muted |
| `faint` | `#6E646A` | 3.48:1 | ⚠️ large-only | ≥24px / decorative **only** |
| **rose** | `#AF5F5F` | 4.35:1 | ⚠️ fill/large | Button fills, large accents |
| rose-lt | `#C98A8A` | 7.04:1 | AAA | **Links / accent text (dark)** |
| coral | `#D98E6A` | 7.55:1 | AAA | Eyebrow, code decorators |
| gold | `#E5B567` | 10.5:1 | AAA | Accent, code keywords, gradient end |

### Hard rules (these prevent real bugs)

1. **Primary button** = `--ig-primary` (`#AF5F5F`) with **white** text → 4.54:1 AA.
   Never dark text on rose (4.18:1, fails).
2. **Accent text** is theme-dependent: dark theme → `rose-lt #C98A8A` (7.04:1);
   light theme → `rose #AF5F5F` (4.54:1 on white; `rose-lt` is only 2.81:1 on white - fails).
3. **`#AF5F5F` is never small body text on dark** (4.35:1). Fills & large accents only.
4. **`faint` is never essential body text** - large or decorative only.
5. **Prose width caps at `--ig-measure` (70ch)**; lede at 62ch.
6. Gradients (`--ig-gradient`) are for **large display text only** (≥39px), where the 3:1
   large-text threshold applies.

## How to use

```ts
// site/.vitepress/theme/index.ts
import './design-tokens.css'   // FIRST - defines tokens + VitePress var mapping
import './style.css'           // component + brand theming, consuming var(--ig-*)
```

```css
.my-card {
  padding: var(--ig-s5);                 /* 24px */
  border-radius: var(--ig-r-md);         /* 12px */
  border: 1px solid var(--ig-border);
  color: var(--ig-text-2);
  font-size: var(--ig-fs-body);
  line-height: var(--ig-lh-body);
}
.my-card a { color: var(--ig-link); }    /* theme-correct, AA-safe */
```

## Sources

- [WCAG 2.1 - Contrast (W3C)](https://www.w3.org/TR/WCAG21/) · [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Modular type scaling](https://www.kalamuna.com/blog/modular-type-scaling-frontend-developers)
- [Spacing, grids & layouts (Design Systems)](https://www.designsystems.com/space-grids-and-layouts/)
- [Optimal line length (Baymard)](https://baymard.com/blog/line-length-readability) · [UXPin](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/)
