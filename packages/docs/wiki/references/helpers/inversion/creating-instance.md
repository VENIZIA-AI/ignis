# Creating an Instance

`Container` extends `BaseHelper`, providing a named scope for debugging context.

```typescript
import { Container } from '@venizia/ignis-inversion';

const container = new Container({ scope: 'MyApp' });
```

The `scope` parameter is optional and defaults to `'Container'`. It is used for logging and error context only.
