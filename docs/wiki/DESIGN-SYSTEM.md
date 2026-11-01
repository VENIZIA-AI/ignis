# IGNIS Docs - Design System

The standards behind how the IGNIS documentation site looks: type, spacing, contrast and measure.

> The site is the shared Venizia theme in `site/.vitepress/theme/shared/`, a copy of VULCAN's folder
> that is never edited here. It owns the neutrals, fonts, header, doc pages and footer. IGNIS sets its
> accent in `site/.vitepress/theme/product.css`. The `--ig-*` brand colours in
> [`design-tokens.css`](./site/.vitepress/theme/design-tokens.css) are a reference copy of those accent
> values; no page reads them.

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

## Color - WCAG-verified

Brand anchor is **`#AF5F5F`** (rose). Contrast measured with the WCAG 2.1 formula
against the dark background `#0B0A0C`.

| Token | Hex | Contrast (dark bg) | Rating | Use |
| --- | --- | --- | --- | --- |
| `text` | `#EDE7EA` | 16.2:1 | AAA | Body, headings |
| `text-2` | `#B4ABB0` | 8.84:1 | AAA | Secondary body, lede |
| `text-3` | `#8C828A` | 5.34:1 | AA | Smallest readable muted |
| **rose** | `#AF5F5F` | 4.35:1 | ⚠️ fill/large | Button fills, large accents |
| rose-lt | `#C98A8A` | 7.04:1 | AAA | **Links / accent text (dark)** |
| coral | `#D98E6A` | 7.55:1 | AAA | Eyebrow, code decorators |
| gold | `#E5B567` | 10.5:1 | AAA | Accent, code keywords |

### Hard rules (these prevent real bugs)

1. **Primary button** = `--accent` (`#AF5F5F`) with **white** text → 4.54:1 AA.
   Never dark text on rose (4.18:1, fails).
2. **Accent text** is theme-dependent: dark theme → `rose-lt #C98A8A` (7.04:1);
   light theme → `rose #AF5F5F` (4.54:1 on white; `rose-lt` is only 2.81:1 on white - fails).
3. **`#AF5F5F` is never small body text on dark** (4.35:1). Fills & large accents only.
4. **Prose width caps at 70ch**; lede at 62ch.

## Where the values live

The shared theme (`site/.vitepress/theme/shared/`) sets the neutrals, fonts, type and spacing.
`site/.vitepress/theme/product.css` sets IGNIS's accent. Change the accent there, not in
`design-tokens.css`.

## Sources

- [WCAG 2.1 - Contrast (W3C)](https://www.w3.org/TR/WCAG21/) · [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Modular type scaling](https://www.kalamuna.com/blog/modular-type-scaling-frontend-developers)
- [Spacing, grids & layouts (Design Systems)](https://www.designsystems.com/space-grids-and-layouts/)
- [Optimal line length (Baymard)](https://baymard.com/blog/line-length-readability) · [UXPin](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/)
