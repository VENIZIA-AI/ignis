import type { VulcanConfig } from '@venizia/vulcan';

export const agent = {
  list: ['claude'],
  // The Venizia-stack rules (V-B-05, V-B-09, V-C-07, V-C-08, V-C-20) ship as a pack, not in the base rules.
  packs: ['venizia'],
  rules: { 'V-W-01': 'on-user-word' },
  // The session digest names the rules sessions drop most, then prints the minimap shape from .agents/rules.md.
  digest: { oftenDropped: ['P-09', 'P-10', 'B-03', 'B-05', 'P-05', 'P-15', 'W-02'] },
  // Plugins the owner turned off for this repository; vulcan sync writes them into .claude/settings.json.
  claude: {
    settings: {
      enabledPlugins: {
        'figma@claude-plugins-official': false,
        'chrome-devtools-mcp@claude-plugins-official': false,
      },
    },
  },
} satisfies VulcanConfig.Agent;
