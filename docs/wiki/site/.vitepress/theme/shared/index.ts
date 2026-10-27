// Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
// scripts/wiki-shared in VULCAN. Edit it there, never in a copy.
//
// The theme every wiki loads. The product's own files sit one folder up, under fixed names: product.css (its
// colours), design-tokens.css (its other tokens), style.css (the rules only it has), HomeLanding.vue and home-content.ts.
import { h } from 'vue';
import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';

import './fonts.css';
import './tokens.css';
import '../product.css';
import '../design-tokens.css';
import './base.css';
import '../style.css';
import './vp-map.css';
import './doc.css';
import './header.css';
import './theme-switch.css';
import './home.css';
import './footer.css';
import './changelog.css';
import ChangelogIndex from './ChangelogIndex.vue';
import SiteLayout from './SiteLayout.vue';
import HomeLanding from '../HomeLanding.vue';
import { HOME, SITE, VERSION } from '../home-content';

export default {
  extends: DefaultTheme,
  Layout: () => h(SiteLayout, { site: SITE, version: VERSION, home: HOME }),
  enhanceApp({ app }) {
    app.component('HomeLanding', HomeLanding);
    app.component('ChangelogIndex', ChangelogIndex);
  },
} satisfies Theme;
