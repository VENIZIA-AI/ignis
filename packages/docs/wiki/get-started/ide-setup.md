# IDE Setup Guide

Configure your development environment for the best Ignis development experience.


## VSCode (Recommended)

VSCode provides the best TypeScript support and debugging experience for Ignis.

### Required Extensions

Install these extensions for core functionality:

| Extension | Purpose |
|-----------|---------|
| [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) | Code linting |
| [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) | Code formatting |
| [TypeScript Importer](https://marketplace.visualstudio.com/items?itemName=pmneo.tsimporter) | Auto-import suggestions |

### Recommended Extensions

| Extension | Purpose |
|-----------|---------|
| [Error Lens](https://marketplace.visualstudio.com/items?itemName=usernamehw.errorlens) | Inline error display |
| [Thunder Client](https://marketplace.visualstudio.com/items?itemName=rangav.vscode-thunder-client) | API testing |
| [GitLens](https://marketplace.visualstudio.com/items?itemName=eamodio.gitlens) | Git visualization |
| [Database Client](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-database-client2) | PostgreSQL viewer |
| [Todo Tree](https://marketplace.visualstudio.com/items?itemName=Gruntfuggly.todo-tree) | TODO tracking |
| [DotENV](https://marketplace.visualstudio.com/items?itemName=mikestead.dotenv) | .env syntax highlighting |

### Quick Install

```bash
# Install all recommended extensions
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension pmneo.tsimporter
code --install-extension usernamehw.errorlens
code --install-extension rangav.vscode-thunder-client
code --install-extension mikestead.dotenv
```


## Workspace Settings

Create `.vscode/settings.json` in your project:

```json
{
  // Editor
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },
  "editor.tabSize": 2,

  // TypeScript
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",

  // ESLint
  "eslint.validate": ["typescript"],
  "eslint.workingDirectories": [{ "mode": "auto" }],

  // Files
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/.git": true
  },
  "files.associations": {
    "*.env*": "dotenv"
  },

  // Search
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/coverage": true
  }
}
```


## Debugging Configuration

Create `.vscode/launch.json` for debugging:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["run", "server:dev"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"],
      "env": {
        "NODE_ENV": "development",
        "DEBUG": "true"
      }
    },
    {
      "name": "Debug Current File",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["run", "${file}"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    },
    {
      "name": "Debug Tests",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "bun",
      "runtimeArgs": ["test", "--watch"],
      "cwd": "${workspaceFolder}",
      "console": "integratedTerminal"
    },
    {
      "name": "Attach to Process",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### How to Debug

1. Set breakpoints by clicking the gutter (left of line numbers)
2. Press `F5` or select "Debug Server" from the Run panel
3. The server starts and pauses at breakpoints
4. Use the Debug toolbar to step through code


## Tasks Configuration

Create `.vscode/tasks.json` for common tasks:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Dev Server",
      "type": "shell",
      "command": "bun run server:dev",
      "group": "build",
      "presentation": {
        "reveal": "always",
        "panel": "new"
      },
      "problemMatcher": []
    },
    {
      "label": "Run Migrations",
      "type": "shell",
      "command": "bun run migrate:dev",
      "group": "build",
      "problemMatcher": []
    },
    {
      "label": "Type Check",
      "type": "shell",
      "command": "bun x tsc --noEmit",
      "group": "build",
      "problemMatcher": ["$tsc"]
    },
    {
      "label": "Lint",
      "type": "shell",
      "command": "bun run lint",
      "group": "build",
      "problemMatcher": ["$eslint-stylish"]
    },
    {
      "label": "Build",
      "type": "shell",
      "command": "bun run build",
      "group": {
        "kind": "build",
        "isDefault": true
      },
      "problemMatcher": ["$tsc"]
    }
  ]
}
```

### Running Tasks

- Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac) to run the default build task
- Press `Ctrl+Shift+P` → "Tasks: Run Task" to see all tasks


## TypeScript Configuration

Ensure your `tsconfig.json` has these settings for best IDE support:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",

    // Path aliases (optional but recommended)
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@models/*": ["src/models/*"],
      "@controllers/*": ["src/controllers/*"],
      "@services/*": ["src/services/*"],
      "@repositories/*": ["src/repositories/*"]
    },

    // Decorators (required for Ignis)
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Path Aliases

With the above config, you can use:

```typescript
// Instead of
import { User } from '../../../models/user.model';

// Use
import { User } from '@models/user.model';
```


## Keyboard Shortcuts

Essential shortcuts for productivity:

| Action | Windows/Linux | Mac |
|--------|---------------|-----|
| Go to Definition | `F12` | `F12` |
| Peek Definition | `Alt+F12` | `Option+F12` |
| Find All References | `Shift+F12` | `Shift+F12` |
| Rename Symbol | `F2` | `F2` |
| Quick Fix | `Ctrl+.` | `Cmd+.` |
| Go to File | `Ctrl+P` | `Cmd+P` |
| Go to Symbol | `Ctrl+Shift+O` | `Cmd+Shift+O` |
| Command Palette | `Ctrl+Shift+P` | `Cmd+Shift+P` |
| Toggle Terminal | `` Ctrl+` `` | `` Cmd+` `` |
| Start Debugging | `F5` | `F5` |
| Toggle Breakpoint | `F9` | `F9` |


## Snippets

Create `.vscode/ignis.code-snippets` for Ignis-specific snippets:

```json
{
  "Ignis Controller": {
    "prefix": "ignis-controller",
    "body": [
      "import { BaseController, controller, get, post } from '@venizia/ignis';",
      "",
      "@controller({ path: '/${1:resource}' })",
      "export class ${2:Name}Controller extends BaseController {",
      "  constructor() {",
      "    super({ scope: ${2:Name}Controller.name, path: '/${1:resource}' });",
      "  }",
      "",
      "  @get('/')",
      "  async getAll() {",
      "    return { message: 'Hello from ${1:resource}' };",
      "  }",
      "}"
    ],
    "description": "Create Ignis Controller"
  },
  "Ignis Repository": {
    "prefix": "ignis-repository",
    "body": [
      "import { DefaultCRUDRepository, repository } from '@venizia/ignis';",
      "import { ${1:Entity} } from '@/models/${2:entity}.model';",
      "import { PostgresDataSource } from '@/datasources/postgres.datasource';",
      "",
      "@repository({ model: ${1:Entity}, dataSource: PostgresDataSource })",
      "export class ${1:Entity}Repository extends DefaultCRUDRepository<typeof ${1:Entity}.schema> {",
      "  $0",
      "}"
    ],
    "description": "Create Ignis Repository"
  },
  "Ignis Service": {
    "prefix": "ignis-service",
    "body": [
      "import { BaseService, inject } from '@venizia/ignis';",
      "",
      "export class ${1:Name}Service extends BaseService {",
      "  constructor() {",
      "    super({ scope: ${1:Name}Service.name });",
      "  }",
      "",
      "  async ${2:method}() {",
      "    $0",
      "  }",
      "}"
    ],
    "description": "Create Ignis Service"
  },
  "Ignis Model": {
    "prefix": "ignis-model",
    "body": [
      "import {",
      "  BaseEntity,",
      "  createRelations,",
      "  generateIdColumnDefs,",
      "  generateTzColumnDefs,",
      "  model,",
      "  TTableObject,",
      "} from '@venizia/ignis';",
      "import { pgTable, text } from 'drizzle-orm/pg-core';",
      "",
      "export const ${1:name}Table = pgTable('${2:TableName}', {",
      "  ...generateIdColumnDefs({ id: { dataType: 'string' } }),",
      "  ...generateTzColumnDefs(),",
      "  $0",
      "});",
      "",
      "export const ${1:name}Relations = createRelations({",
      "  source: ${1:name}Table,",
      "  relations: [],",
      "});",
      "",
      "export type T${2:TableName}Schema = typeof ${1:name}Table;",
      "export type T${2:TableName} = TTableObject<T${2:TableName}Schema>;",
      "",
      "@model({ type: 'entity' })",
      "export class ${2:TableName} extends BaseEntity<typeof ${2:TableName}.schema> {",
      "  static override schema = ${1:name}Table;",
      "  static override relations = () => ${1:name}Relations.definitions;",
      "  static override TABLE_NAME = '${2:TableName}';",
      "}"
    ],
    "description": "Create Ignis Model/Entity"
  }
}
```

### Using Snippets

Type the prefix (e.g., `ignis-controller`) and press `Tab` to expand.


## Terminal Setup

### Integrated Terminal

Configure your preferred shell in `.vscode/settings.json`:

```json
{
  "terminal.integrated.defaultProfile.linux": "bash",
  "terminal.integrated.defaultProfile.osx": "zsh",
  "terminal.integrated.defaultProfile.windows": "PowerShell"
}
```

### Useful Aliases

Add to your shell config (`.bashrc`, `.zshrc`):

```bash
# Ignis shortcuts
alias ig-dev="bun run server:dev"
alias ig-build="bun run build"
alias ig-migrate="bun run migrate:dev"
alias ig-lint="bun run lint"
alias ig-test="bun test"
```


## Database Tools

### VSCode Database Client

1. Install [Database Client](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-database-client2)
2. Click the database icon in the sidebar
3. Add new connection:
   - Server Type: PostgreSQL
   - Host: localhost
   - Port: 5432
   - Username: postgres
   - Password: (your password)
   - Database: (your database)

### Alternative: pgAdmin

For a full-featured PostgreSQL GUI, use [pgAdmin](https://www.pgadmin.org/).


## Common Issues

### "Cannot find module" Errors

**Solution:** Restart TypeScript server
- Press `Ctrl+Shift+P` → "TypeScript: Restart TS Server"

### ESLint Not Working

**Solution:** Check ESLint output
- View → Output → Select "ESLint" from dropdown

### Slow IntelliSense

**Solutions:**
1. Exclude `node_modules` from search (already in settings above)
2. Increase TypeScript memory:
```json
{
  "typescript.tsserver.maxTsServerMemory": 4096
}
```

### Decorators Not Recognized

**Solution:** Ensure `tsconfig.json` has:
```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```


## Other IDEs

### WebStorm / IntelliJ IDEA

1. Enable TypeScript Language Service
2. Configure ESLint: Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
3. Configure Prettier: Settings → Languages & Frameworks → JavaScript → Prettier

### Neovim

Use these plugins:
- [nvim-lspconfig](https://github.com/neovim/nvim-lspconfig) - TypeScript LSP
- [null-ls.nvim](https://github.com/jose-elias-alvarez/null-ls.nvim) - ESLint/Prettier
- [nvim-cmp](https://github.com/hrsh7th/nvim-cmp) - Autocompletion


## Next Steps

- [Prerequisites](./prerequisites.md) - Check system requirements
- [5-Minute Quickstart](./5-minute-quickstart.md) - Build your first endpoint
- [Building a CRUD API](./building-a-crud-api.md) - Complete tutorial
