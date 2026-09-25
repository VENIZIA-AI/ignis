# Contribution Workflow

Guidelines for contributing to IGNIS - help us maintain quality and streamline the process.

## Git Branching Strategy

```
main (production)
  ↑
  │ merge only from develop
  │
develop (staging)
  ↑
  │ PRs target here
  │
feature/*, fix/*, docs/* (your work)
```

**Important:**
- Create PRs to `develop` branch
- Do NOT create PRs to `main` branch
- `main` only accepts merges from `develop`
- Releases are tagged in git (e.g., `v1.0.0`)

## 1. Setup

**Quick start:**
```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/ignis.git
cd ignis

# 3. Install dependencies
make install
# Or: bun install

# 4. Add upstream remote
git remote add upstream https://github.com/VENIZIA-AI/ignis.git

# 5. Point git at the repository's hooks
make setup-hooks
```

> [!NOTE]
> `make install` is `bun install` and nothing more. No `package.json` in this repository declares a `postinstall` script, so installing never force-updates anything. To pull the latest published version of a package, run its `make update-<package>` target on purpose.

## Package Build Order

IGNIS is a monorepo with interdependent packages. Understanding the dependency chain is critical for development:

The main chain is:

```
dev-configs -> inversion -> {filter, helpers} -> kernel -> connectors -> core-server
```

`boot`, `atlas` and `core-worker` hang off that chain rather than sitting in it. `core-server` depends on none of them, so `make build-all` names them separately.

**The ten packages.** The directory name and the npm name often differ:

| Directory | npm name | Depends on | Purpose |
|-----------|----------|------------|---------|
| `dev-configs` | `@venizia/dev-configs` | - | Shared ESLint, Prettier, TypeScript configs |
| `inversion` | `@venizia/ignis-inversion` | dev-configs | IoC container, DI primitives |
| `filter` | `@venizia/ignis-filter` | inversion | Isomorphic filter language. Deliberately not after helpers |
| `helpers` | `@venizia/ignis-helpers` | inversion | Utilities, loggers, crypto, Redis, sockets |
| `kernel` | `@venizia/ignis-kernel` | helpers, filter | Browser-pure tree: DI, base classes, REST controllers, auth seam |
| `connectors` | `@venizia/ignis-connectors` | kernel | Postgres, SQLite, Typesense, Meilisearch |
| `core-server` | `@venizia/ignis` | connectors | The server framework. `make core` is an alias for `make core-server` |
| `core-worker` | `@venizia/ignis-worker` | kernel | Browser Worker host. Sits beside connectors, never depends on core-server |
| `boot` | `@venizia/ignis-boot` | helpers | The `ignis-artifacts` generator, consumed by applications |
| `atlas` | `@venizia/ignis-atlas` | helpers | The MCP server over the wiki, changelogs and knowledge bundle |

**Why this matters:**
- If you modify `kernel`, you must rebuild `connectors` and `core-server`
- If you modify `inversion`, you must rebuild everything downstream of it
- The Makefile resolves these dependencies for you

## Makefile Commands

The project uses a Makefile for common development tasks:

| Command | Description |
|---------|-------------|
| `make install` | `bun install` |
| `make update` | Alias for `make install` |
| `make build` | Alias for `build-all` |
| `make build-all` | Rebuild `core`, `core-worker`, `boot`, `atlas` and `docs`, then run `surface-check`, `symbols-check` and `wiki-links-check` |
| `make clean` | Clean build artifacts from all packages |
| `make lint` | Lint all packages |
| `make lint-all` | Lint packages, examples, atlas and scripts - this is the bar a PR must clear |
| `make test-all` | Run every package suite |
| `make setup-hooks` | Point `core.hooksPath` at `.githooks` |
| `make help` | Show all available commands |

**Individual package builds** (dependencies are automatically resolved):
```bash
make core          # Alias for core-server: dev-configs -> inversion -> {filter, helpers}
                   #   -> kernel -> connectors -> core-server. It does NOT build boot.
make core-worker   # @venizia/ignis-worker, through kernel
make connectors    # @venizia/ignis-connectors, through kernel
make kernel        # @venizia/ignis-kernel, through helpers and filter
make boot          # @venizia/ignis-boot, through helpers
make helpers       # @venizia/ignis-helpers, through inversion
make filter        # @venizia/ignis-filter, through inversion
make inversion     # @venizia/ignis-inversion, through dev-configs
make dev-configs   # @venizia/dev-configs only
make docs          # Build VitePress documentation (independent)
make atlas         # The Atlas MCP server over the wiki, changelogs and knowledge bundle
```

**Force update individual packages** (each fetches the latest published version from npm):
```bash
make update-core        # or update-core-server
make update-kernel
make update-boot
make update-helpers
make update-filter
make update-inversion
make update-dev-configs
make update-atlas
```

## 2. Development Workflow

### Step 1: Create Branch

```bash
# Sync with upstream
git fetch upstream
git checkout develop
git merge upstream/develop

# Create feature branch
git checkout -b feature/your-feature-name
```

**Branch naming:**
| Type | Format | Example |
|------|--------|---------|
| Feature | `feature/description` | `feature/add-redis-cache` |
| Bug fix | `fix/description` | `fix/auth-token-expiry` |
| Docs | `docs/description` | `docs/update-quickstart` |
| Chore | `chore/description` | `chore/upgrade-deps` |

### Step 2: Make Changes

**Checklist:**
- Follow [Code Style Standards](./code-style-standards/)
- Follow [Architectural Patterns](./architectural-patterns.md)
- Add tests for new features/fixes
- Update docs in `docs/wiki/content/` if needed

### Step 3: Commit

Every commit serves a GitHub issue. Open the issue first in `VENIZIA-AI/ignis` and add it to the [IGNIS project](https://github.com/orgs/VENIZIA-AI/projects/6). Then write one line: the issue number, then a [Conventional Commits](https://www.conventionalcommits.org/) subject.

```bash
# Examples
git commit -m "[#38] fix(helpers): copyObject encodes the copy source, so a non-ASCII key copies"
git commit -m "[#40] feat(helpers): the MIME table knows the office formats"
git commit -m "[#46] docs: static-asset MetaLink schema and route list"
```

A commit that serves several issues it cannot be split between lists each: `[#42][#44] ...`.

**Commit types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `chore:` - Maintenance (deps, config)
- `refactor:` - Code restructuring
- `test:` - Adding tests

### Step 4: Validate

```bash
# Lint and format (from root) - zero warnings and zero errors is the bar
make lint-all
# Or run `bun run lint:fix` inside a package directory

# Build all packages (from root) - tests run against dist/, so build first
make build

# Run every package suite, or one of them
make test-all
make test-core-server
```

> [!IMPORTANT]
> Run tests through the `make test-*` targets, not a bare `bun test` inside a package. The Makefile is the one home of the flags (`BUN_TEST_FLAGS ?= --parallel`, which implies `--isolate`). Two packages, `boot` and `atlas`, also own their own `test` script (`NODE_ENV=test bun test --env-file=.env.test`); a bare `bun test` there silently skips both the environment and the env file. The targets are `test-inversion`, `test-helpers`, `test-boot`, `test-kernel`, `test-connectors`, `test-core-worker`, `test-core-server` and `test-atlas`. `filter` has no suite.

> [!NOTE]
> Tests load `dist/`, not `src/`, so a stale build tests stale code. `make <package>` handles the ordering for you: `rebuild.sh` type-checks first and only then cleans `dist/`, so a broken test aborts the run before anything is deleted.

## 3. Submit Pull Request

```bash
# Push your branch
git push origin feature/your-feature-name
```

**PR Guidelines:**

| Item | Description |
|------|-------------|
| **Title** | The issue number, then a conventional commit subject: `[#123] feat: add Redis caching` |
| **Description** | Explain what and why (not just how) |
| **Link issues** | One `Closes #123` line per issue the PR finishes, so merging closes them and moves them to Done on the project |
| **Screenshots** | Include for UI changes |
| **Breaking changes** | Clearly mark and explain |

**PR Checklist:**
- All tests pass
- Code is linted and formatted
- Documentation updated
- Commit messages follow conventions
- Branch is up-to-date with `develop`

## 4. Review Process

**What to expect:**
1. Maintainer reviews your PR (usually within 2-3 days)
2. Feedback or change requests may be provided
3. Address feedback and push updates
4. Once approved, maintainer merges to `develop`

**Responding to feedback:**
```bash
# Make requested changes
git add .
git commit -m "[#123] fix: address review feedback"
git push origin feature/your-feature-name
```

**Thank you for contributing to IGNIS!**