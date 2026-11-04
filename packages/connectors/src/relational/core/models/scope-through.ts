import { ScopeThroughBrand, type IScopeThrough } from '@venizia/ignis-kernel';
import type { IDefinedEntity, TOneRelationNameOf } from './common';

export class ScopeThrough {
  /**
   * The value of `settings.access.through`: scope this model through the parent a `one` relation points at.
   * `entity` is read for its type only, so a misspelled or to-many relation name does not compile.
   */
  static of<Entity extends IDefinedEntity, Name extends TOneRelationNameOf<Entity>>(opts: {
    entity: Entity;
    relation: Name;
  }): IScopeThrough<Name> {
    return { [ScopeThroughBrand.KEY]: true, relation: opts.relation };
  }
}
