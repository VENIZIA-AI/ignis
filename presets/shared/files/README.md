# {{shared}}

`{{package}}` is the side-neutral package of the {{project}} project: plain TypeScript that backend and frontend apps both import. It depends on no framework, so keep it that way - no DOM, no Bun API, no server or UI package in `src`.

```typescript
import { Greeting } from '{{package}}';

Greeting.of({ name: 'IGNIS' });
```

## Scripts

- `bun run typecheck` - type-check `src`.
- `bun run lint` - lint and format check (`lint:fix` fixes).
- `bun run test` - run the tests.
