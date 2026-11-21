import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** The `IArtifactIndex` field names, in registration order. `@venizia/ignis-boot` mirrors these values in its own `ArtifactIndexFields` - boot cannot depend on kernel. */
export class ArtifactIndexFields extends ConstClass {
  static readonly CONFIGURATIONS = 'configurations';
  static readonly DATA_SOURCES = 'dataSources';
  static readonly COMPONENTS = 'components';
  static readonly REPOSITORIES = 'repositories';
  static readonly SERVICES = 'services';
  static readonly CONTROLLERS = 'controllers';
}

/** Union of the `ArtifactIndexFields` values. */
export type TArtifactIndexField = TConstValue<typeof ArtifactIndexFields>;

/** The values of the `Sec-Fetch-Site` request header, the vocabulary of `TSecFetchSite`. */
export const SecFetchSiteValues = ['same-origin', 'same-site', 'none', 'cross-site'] as const;

/** The `encoding` of `ICompressOptions`. */
export class CompressEncodings extends ConstClass {
  static readonly GZIP = 'gzip';
  static readonly DEFLATE = 'deflate';
}

/** Valid compress encoding values. */
export type TCompressEncoding = TConstValue<typeof CompressEncodings>;
