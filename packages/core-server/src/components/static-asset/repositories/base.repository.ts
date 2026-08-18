import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
import type { BaseMetaLinkModel } from '../models';

/** Base MetaLink repository - bind a model + datasource via @repository in a subclass. */
export class BaseMetaLinkRepository extends DefaultCRUDRepository<
  typeof BaseMetaLinkModel.schema
> {}
