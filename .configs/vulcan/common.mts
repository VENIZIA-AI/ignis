import type { VulcanConfig } from '@venizia/vulcan';

export const common = {
  // The wiki's accent family; vulcan sync writes the resolved tokens into the manifest, which config.mts reads.
  theme: { accent: '#af5f5f', accentDark: '#c98a8a', accentText: '#a15757' },
  remove: { 'knowledge.atlas.sources': ['ignis'] },
} satisfies VulcanConfig.Common;
