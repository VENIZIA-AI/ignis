---
title: "@venizia/ignis-kernel/metadata (2 of 2)"
description: "Every export of @venizia/ignis-kernel/metadata, from the built declarations (generated)."
---

# `@venizia/ignis-kernel/metadata (2 of 2)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 2 of [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata).

## `provide`

*const*

Marks a component method as the provider of `key`. `registerArtifacts` binds the key to a lazy provider that resolves the component and calls the method; SINGLETON unless `scope` says otherwise.

```ts
export declare const provide: (opts: {
    key: TBindingKey;
    scope?: TBindingScope;
}) => MethodDecorator;
```

Source: `packages/kernel/src/base/metadata/injectable.ts`

## `repository`

*const*

Class decorator that registers a repository and binds it to a model (or, for a remote repository, only a datasource). Called without arguments on a subclass it reuses the type, model and datasource of its nearest decorated parent; registration options are not inherited.

**Example**
```typescript
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis-connectors/postgres';
import { AppDataSource } from './app.datasource';
import { Note, noteTable } from './note.model';

export @repository({ model: Note, dataSource: AppDataSource })
class NoteRepository extends DefaultCRUDRepository<typeof noteTable> {}
```

```ts
export declare const repository: <Model extends AbstractEntity = AbstractEntity, DataSource extends IDataSource = IDataSource>(metadata?: TRepositoryMetadata<Model, DataSource>) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/persistents/repository/index.ts`

## `service`

*const*

Class decorator that registers the class as a service artifact; accepts the same registration options as `injectable`.

**Example**
```typescript
import { BaseService, service } from '@venizia/ignis';

export @service()
class MailService extends BaseService {
  constructor() {
    super({ scope: MailService.name });
  }
}
```

```ts
export declare const service: <ApplicationType = unknown>(opts?: IArtifactRegistrationOptions<ApplicationType>) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/injectable.ts`

## `TBindingNamespace`

*type*

Valid `BindingNamespaces` values.

```ts
export type TBindingNamespace = TConstValue<typeof BindingNamespaces>;
```

Source: `packages/kernel/src/common/bindings.ts`
