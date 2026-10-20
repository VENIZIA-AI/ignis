import type { TConstValue } from '@venizia/ignis-helpers';

export class BuildInfoFormats {
  static readonly TS = 'ts';
  static readonly JSON = 'json';

  static readonly SCHEME_SET = new Set<string>([this.TS, this.JSON]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TBuildInfoFormat = TConstValue<typeof BuildInfoFormats>;

/**
 * Each field is spelled differently by every CI provider, and `APP_ENV_*` is what this
 * organisation's pipelines export - so it is read before the generic `APP_BUILD_*` pair and before
 * anything provider-specific. The first key carrying a non-blank value wins.
 */
export class BuildInfoEnvironmentKeys {
  static readonly VERSION: readonly string[] = [
    'APP_ENV_BUILD_VERSION',
    'APP_BUILD_VERSION',
    'CI_COMMIT_TAG',
    'GITHUB_REF_NAME',
  ];

  static readonly COMMIT: readonly string[] = [
    'APP_ENV_BUILD_COMMIT_TAG',
    'APP_BUILD_COMMIT',
    'CI_COMMIT_SHA',
    'GITHUB_SHA',
    'COMMIT_SHA',
  ];

  static readonly BRANCH: readonly string[] = [
    'APP_BUILD_BRANCH',
    'CI_COMMIT_REF_NAME',
    'GITHUB_REF_NAME',
    'BRANCH_NAME',
  ];

  static readonly BUILT_AT: readonly string[] = ['APP_ENV_BUILD_DATE', 'APP_BUILD_DATE'];
}
