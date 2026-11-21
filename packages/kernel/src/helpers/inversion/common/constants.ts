import type { TConstValue } from '@venizia/ignis-helpers/common';
import { ConstClass } from '@venizia/ignis-helpers/common';

/** What a decorated class is to the application - the one fact the artifact generator and the registration methods both read. */
export class ArtifactTypes extends ConstClass {
  static readonly CONFIGURATION = 'configuration';
  static readonly COMPONENT = 'component';
  static readonly CONTROLLER = 'controller';
  static readonly SERVICE = 'service';
  static readonly REPOSITORY = 'repository';
  static readonly DATASOURCE = 'datasource';
  static readonly MODEL = 'model';
}

/** The `format` of `getAuthorizeModelPrincipals` and `getAuthorizeModelSettings`: ARRAY or RECORD. */
export class AuthorizeModelFormats extends ConstClass {
  static readonly ARRAY = 'array';
  static readonly RECORD = 'record';
}

/** Valid authorize model format values. */
export type TAuthorizeModelFormat = TConstValue<typeof AuthorizeModelFormats>;
