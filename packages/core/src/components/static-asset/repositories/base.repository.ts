import { IDataSource } from '@/base/datasources';
import { repository } from '@/base/metadata';
import { DefaultCRUDRepository, TRelationConfig } from '@/base/repositories';
import { TMetaLinkSchema } from '../models';
import { TClass } from '@venizia/ignis-helpers';
import { BaseEntity } from '@/base/models';

@repository({})
export class BaseMetaLinkRepository extends DefaultCRUDRepository<TMetaLinkSchema> {
  constructor(opts: {
    entityClass: TClass<BaseEntity<TMetaLinkSchema>>;
    relations: { [relationName: string]: TRelationConfig };
    dataSource: IDataSource;
  }) {
    super(opts);
  }
}
