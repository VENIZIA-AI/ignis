import { DefaultRelationalRepository } from '@/connectors/postgres/repositories';
import { BaseMetaLinkModel } from '../models';

/** Base MetaLink repository — bind a model + datasource via @repository in a subclass. */
export class BaseMetaLinkRepository extends DefaultRelationalRepository<
  typeof BaseMetaLinkModel.schema
> {}
