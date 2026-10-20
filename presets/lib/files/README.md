# {{package}}

A shared IGNIS library of {{project}}. Backend apps import it; it does not run on its own.

```ts
import { GreetingService } from '{{package}}';
```

| Script | What it does |
|---|---|
| `bun run typecheck` | Type-checks `src` |
| `bun run lint` | oxlint, eslint and oxfmt; `bun run lint:fix` fixes |
| `bun run test` | Runs the tests |
| `bun run clean` | Removes what the checks generate |

`exports` points at `src/index.ts`, so an app's bundler compiles the library with the app; there is no build step.
