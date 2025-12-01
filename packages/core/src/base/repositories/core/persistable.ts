import { IDataSource } from '@/base/datasources';
import { BaseEntity, IdType, TTableInsert, TTableObject, TTableSchemaWithId } from '@/base/models';
import { IClass, TNullable } from '@/common/types';
import { getError } from '@/helpers';
import { isEmpty } from 'lodash';
import { TCount, TWhere } from '../common';
import { RepositoryOperationScopes } from '../common/constants';
import { ReadableRepository } from './readable';

export class PersistableRepository<
  EntitySchema extends TTableSchemaWithId = TTableSchemaWithId,
  DataObject extends TTableObject<EntitySchema> = TTableObject<EntitySchema>,
  PersistObject extends TTableInsert<EntitySchema> = TTableInsert<EntitySchema>,
  ExtraOptions extends TNullable<object> = undefined,
> extends ReadableRepository<EntitySchema, DataObject, PersistObject, ExtraOptions> {
  constructor(opts: { entityClass: IClass<BaseEntity<EntitySchema>>; dataSource: IDataSource }) {
    super({
      entityClass: opts.entityClass,
      dataSource: opts.dataSource,
    });
    this.operationScope = RepositoryOperationScopes.READ_WRITE;
  }

  protected _create(opts: {
    data: Array<PersistObject>;
    options: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return new Promise((resolve, reject) => {
      const {
        returning = true,

        // TODO Handle extra options later
        // ...rest,
      } = opts.options ?? {};

      const task = () => {
        return this.connector.insert(this.entity.schema).values(opts.data);
      };

      if (!returning) {
        task()
          .then(rs => {
            this.logger.debug(
              '[_create] INSERT result | returning: %s | data: %j | rs: %j',
              returning,
              opts.data,
              rs,
            );
            resolve({ count: rs.rowCount ?? 0, data: rs.rows });
          })
          .catch(reject);
        return;
      }

      task()
        .returning()
        .then(rs => {
          this.logger.debug(
            '[_create] INSERT result | returning: %s | data: %j | rs: %j',
            returning,
            opts.data,
            rs,
          );
          resolve({ count: rs.length, data: rs });
        })
        .catch(reject);
    });
  }

  // ---------------------------------------------------------------------------
  override create(opts: {
    data: PersistObject;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    return new Promise((resolve, reject) => {
      this._create({ data: [opts.data], options: opts.options ?? { returning: true } })
        .then(rs => {
          resolve({ count: rs.count, data: rs.data?.[0] ?? null });
        })
        .catch(reject);
    });
  }

  override createAll(opts: {
    data: Array<PersistObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return new Promise((resolve, reject) => {
      this._create({ data: opts.data, options: opts.options ?? { returning: true } })
        .then(resolve)
        .catch(reject);
    });
  }

  // ---------------------------------------------------------------------------
  protected _update(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return new Promise((resolve, reject) => {
      const {
        returning = true,
        force = false,

        // TODO Handle extra options later
        // ...rest,
      } = opts?.options ?? {};

      const where = this.filterBuilder.toWhere({
        schema: this.entity.schema,
        where: opts.where,
      });

      if (!force && (!where || isEmpty(where))) {
        throw getError({
          message: `[_update] Entity: ${this.entity.name} | DENY to perform update | Empty where condition | condition: ${JSON.stringify(where)}`,
        });
      } else {
        this.logger.warn(
          '[_update] Entity: %s | Performing update with empty condition | data: %j | condition: %j ',
          this.entity.name,
          opts.data,
          where,
        );
      }

      const task = () => {
        return this.connector.update(this.entity.schema).set(opts.data).where(where);
      };

      if (!returning) {
        task()
          .then(rs => {
            this.logger.debug(
              '[_update] UPDATE result | returning: %s | data: %j | condition: %j | rs: %j',
              returning,
              opts.data,
              opts.where,
              rs,
            );
            resolve({ count: rs?.rowCount ?? 0, data: rs.rows });
          })
          .catch(reject);
        return;
      }

      task()
        .returning()
        .then(rs => {
          this.logger.debug(
            '[_update] UPDATE result | returning: %s | data: %j | condition: %j | rs: %j',
            returning,
            opts.data,
            opts.where,
            rs,
          );

          if (Array.isArray(rs)) {
            resolve({ count: rs.length, data: rs ?? [] });
            return;
          }

          resolve({ count: rs.rowCount ?? 0, data: rs.rows });
        })
        .catch(reject);
    });
  }

  override updateById(opts: {
    id: IdType;
    data: Partial<PersistObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    return new Promise((resolve, reject) => {
      return this._update({
        where: { id: opts.id },
        data: opts.data,
        options: opts.options,
      })
        .then(rs => {
          resolve({ count: rs.count, data: rs.data?.[0] ?? null });
        })
        .catch(reject);
    });
  }

  override updateAll(opts: {
    data: Partial<PersistObject>;
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return this._update(opts);
  }

  // ---------------------------------------------------------------------------
  protected _delete(opts: {
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return new Promise((resolve, reject) => {
      const {
        returning = true,
        force = false,

        // TODO Handle extra options later
        // ...rest,
      } = opts?.options ?? {};

      const where = this.filterBuilder.toWhere({
        schema: this.entity.schema,
        where: opts.where,
      });

      if (!force && (!where || isEmpty(where))) {
        throw getError({
          message: `[_delete] Entity: ${this.entity.name} | DENY to perform delete | Empty where condition | condition: ${JSON.stringify(where)}`,
        });
      } else {
        this.logger.warn(
          '[_delete] Entity: %s | Performing delete with empty condition | condition: %j',
          this.entity.name,
          where,
        );
      }

      const task = () => {
        return this.connector.delete(this.entity.schema).where(where);
      };

      if (!returning) {
        task()
          .then(rs => {
            this.logger.debug(
              '[_delete] DELETE result | returning: %s | condition: %j | rs: %j',
              returning,
              opts.where,
              rs,
            );
            resolve({ count: rs?.rowCount ?? 0, data: rs.rows });
          })
          .catch(reject);
        return;
      }

      task()
        .returning()
        .then(rs => {
          this.logger.debug(
            '[_delete] DELETE result | returning: %s | condition: %j | rs: %j',
            returning,
            opts.where,
            rs,
          );

          resolve({ count: rs.length, data: rs ?? [] });
        })
        .catch(reject);
    });
  }

  override deleteById(opts: {
    id: IdType;
    options?: (ExtraOptions | {}) & { returning?: boolean };
  }): Promise<TCount & { data: TNullable<EntitySchema['$inferSelect']> }> {
    return new Promise((resolve, reject) => {
      return this._delete({
        where: { id: opts.id },
        options: opts.options,
      })
        .then(rs => {
          resolve({ count: rs.count, data: rs.data?.[0] ?? null });
        })
        .catch(reject);
    });
  }

  override deleteAll(opts: {
    where: TWhere<DataObject>;
    options?: (ExtraOptions | {}) & { returning?: boolean; force?: boolean };
  }): Promise<TCount & { data: TNullable<Array<EntitySchema['$inferSelect']>> }> {
    return this._delete(opts);
  }
}
