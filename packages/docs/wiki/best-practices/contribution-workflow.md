# Contribution Workflow

Guidelines for contributing to Ignis - help us maintain quality and streamline the process.

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
- ✅ Create PRs to `develop` branch
- ❌ Do NOT create PRs to `main` branch
- `main` only accepts merges from `develop`
- Releases are tagged in git (e.g., `v1.0.0`)

## 1. Setup

**Quick start:**
```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/ignis.git
cd ignis

# 3. Install dependencies (this also runs force-update to fetch latest from NPM)
make install
# Or: bun install

# 4. Add upstream remote
git remote add upstream https://github.com/VENIZIA-AI/ignis.git
```

## Package Build Order

Ignis is a monorepo with interdependent packages. Understanding the dependency chain is critical for development:

```
dev-configs → inversion → helpers → boot → core
     ↓            ↓           ↓        ↓      ↓
  @venizia/   @venizia/   @venizia/  @venizia/  @venizia/
  dev-configs ignis-      ignis-     ignis-     ignis
              inversion   helpers    boot       (core)
```

**Dependency meanings:**
| Package | Depends On | Purpose |
|---------|------------|---------|
| `dev-configs` | - | Shared ESLint, TypeScript configs |
| `inversion` | dev-configs | IoC container, DI primitives |
| `helpers` | inversion | Utilities, loggers, crypto |
| `boot` | helpers | Application bootstrapping |
| `core` | boot | Full framework (controllers, repos, etc.) |

**Why this matters:**
- If you modify `helpers`, you must rebuild `boot` and `core`
- If you modify `inversion`, you must rebuild `helpers`, `boot`, and `core`
- The Makefile handles this automatically with dependencies

## Makefile Commands

The project uses a Makefile for common development tasks:

| Command | Description |
|---------|-------------|
| `make install` | Install dependencies and force-update from NPM |
| `make update` | Force update all packages from NPM registry |
| `make build` | Rebuild all packages in correct order |
| `make clean` | Clean build artifacts from all packages |
| `make lint` | Lint all packages |
| `make help` | Show all available commands |

**Individual package builds** (dependencies are automatically resolved):
```bash
make core          # Build @venizia/ignis (builds dev-configs → inversion → helpers → boot → core)
make boot          # Build @venizia/ignis-boot (builds dev-configs → inversion → helpers → boot)
make helpers       # Build @venizia/ignis-helpers (builds dev-configs → inversion → helpers)
make inversion     # Build @venizia/ignis-inversion (builds dev-configs → inversion)
make dev-configs   # Build @venizia/dev-configs only
make docs          # Build VitePress documentation (independent)
make docs-mcp      # Build MCP documentation server
```

**Force update individual packages:**
```bash
make update-core
make update-boot
make update-helpers
make update-inversion
make update-dev-configs
make update-docs
```

## 2. Development Workflow

### Step 1: Create Branch

```bash
# Sync with upstream
git fetch upstream
git checkout main
git merge upstream/main

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
- ✅ Follow [Code Style Standards](./code-style-standards/)
- ✅ Follow [Architectural Patterns](./architectural-patterns.md)
- ✅ Add tests for new features/fixes
- ✅ Update docs in `packages/docs/wiki` if needed

### Step 3: Commit

Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Examples
git commit -m "feat: add Redis caching helper"
git commit -m "fix: correct JWT token validation"
git commit -m "docs: update controller examples"
git commit -m "chore: upgrade Hono to v4.0"
```

**Commit types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation only
- `chore:` - Maintenance (deps, config)
- `refactor:` - Code restructuring
- `test:` - Adding tests

### Step 4: Validate

```bash
# Lint and format (from root)
make lint
# Or: bun run lint:fix

# Build all packages
make build
# Or: bun run build

# Run tests
bun run test
```

## 3. Submit Pull Request

```bash
# Push your branch
git push origin feature/your-feature-name
```

**PR Guidelines:**

| Item | Description |
|------|-------------|
| **Title** | Use conventional commit format: `feat: add Redis caching` |
| **Description** | Explain what and why (not just how) |
| **Link issues** | Reference related issues: `Closes #123` |
| **Screenshots** | Include for UI changes |
| **Breaking changes** | Clearly mark and explain |

**PR Checklist:**
- ✅ All tests pass
- ✅ Code is linted and formatted
- ✅ Documentation updated
- ✅ Commit messages follow conventions
- ✅ Branch is up-to-date with `main`

## 4. Review Process

**What to expect:**
1. Maintainer reviews your PR (usually within 2-3 days)
2. Feedback or change requests may be provided
3. Address feedback and push updates
4. Once approved, maintainer merges to `main`

**Responding to feedback:**
```bash
# Make requested changes
git add .
git commit -m "fix: address review feedback"
git push origin feature/your-feature-name
```

**Thank you for contributing to Ignis! 🎉**