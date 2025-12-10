# @venizia/ignis-inversion

[![npm version](https://img.shields.io/npm/v/@venizia/ignis-inversion.svg)](https://www.npmjs.com/package/@venizia/ignis-inversion)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A standalone **Dependency Injection & Inversion of Control (IoC)** container for the **Ignis Framework**.

## Installation

```bash
bun add @venizia/ignis-inversion
# or
npm install @venizia/ignis-inversion
```

## Quick Example

```typescript
import { Container, injectable, inject } from "@venizia/ignis-inversion";

@injectable()
class UserService {
  getUser(id: string) {
    return { id, name: "John" };
  }
}

@injectable()
class UserController {
  constructor(@inject("UserService") private userService: UserService) {}

  findUser(id: string) {
    return this.userService.getUser(id);
  }
}

// Register and resolve
const container = new Container();
container.bind("UserService").toClass(UserService);
container.bind("UserController").toClass(UserController);

const controller = container.resolve<UserController>("UserController");
```

## About Ignis

Ignis brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono** - giving you the best of both worlds.

## Documentation

- [Ignis Repository](https://github.com/venizia-ai/ignis)
- [Getting Started](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/index.md)
- [Dependency Injection](https://github.com/venizia-ai/ignis/blob/main/packages/docs/wiki/get-started/core-concepts/dependency-injection.md)

## License

MIT
