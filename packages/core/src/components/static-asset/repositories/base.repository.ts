import { DefaultCRUDRepository } from '@/base/repositories';
import { BaseMetaLinkModel } from '../models';

/**
 * Base repository for MetaLink with dependency injection support.
 *
 * Can be extended with a datasource binding:
 * ```typescript
 * @repository({ model: BaseMetaLinkModel, dataSource: PostgresDataSource })
 * export class MetaLinkRepository extends BaseMetaLinkRepository {}
 * ```
 */
export class BaseMetaLinkRepository extends DefaultCRUDRepository<
  typeof BaseMetaLinkModel.schema
> {}
