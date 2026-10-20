import type { TOxlintRuleEntry, TRuleSeverity } from './common';

/** One forbidden property access, with the message the author sees. */
export interface IRestrictedProperty {
  property: string;
  object?: string;
  message: string;
}

/**
 * `no-restricted-properties`. The default bans what exists only in a secure context (https,
 * localhost): on a plain-http LAN origin or in a WebView, `crypto.randomUUID` is `undefined` and the
 * first call throws. Catches the call, `globalThis.crypto.randomUUID`, the bracket form and
 * destructuring; leaves `getRandomValues` alone.
 */
export class NoRestrictedPropertiesRule {
  static readonly NAME = 'no-restricted-properties';

  static readonly SECURE_CONTEXT: readonly IRestrictedProperty[] = [
    {
      property: 'randomUUID',
      message:
        'crypto.randomUUID exists only in a secure context (https, localhost) - on a plain-http origin it is undefined. Use uuidV4 from @venizia/ignis-helpers/uuid.',
    },
  ];

  static build(
    opts: { severity?: TRuleSeverity; extraProperties?: IRestrictedProperty[] } = {},
  ): TOxlintRuleEntry<'no-restricted-properties'> {
    const { severity = 'error', extraProperties = [] } = opts;
    return [severity, ...NoRestrictedPropertiesRule.SECURE_CONTEXT, ...extraProperties];
  }
}
