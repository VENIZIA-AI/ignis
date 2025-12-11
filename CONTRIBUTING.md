# Contributing to Ignis

Thank you for your interest in contributing to Ignis! This guide will help you get started.

For detailed guidelines, see the full [Contribution Workflow](packages/docs/wiki/get-started/best-practices/contribution-workflow.md) documentation.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Git Branching Strategy](#git-branching-strategy)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Submitting Pull Requests](#submitting-pull-requests)
- [Getting Help](#getting-help)

---

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md). We are committed to providing a welcoming and inclusive environment for everyone.

---

## Getting Started

### Prerequisites

| Tool | Version | Installation |
|------|---------|--------------|
| **Bun** | >= 1.3.0 | `curl -fsSL https://bun.sh/install \| bash` |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

### Setup

```bash
# 1. Fork the repository on GitHub

# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/ignis.git
cd ignis

# 3. Install dependencies
bun install

# 4. Add upstream remote
git remote add upstream https://github.com/VENIZIA-AI/ignis.git
```

### Join the Development Team (Optional)

If you'd like to contribute directly to this repository without forking, you can request to join the development team. This gives you push access to create branches directly in the main repository.

**To request access:**
1. Open an issue with the title: `Request to join development team`
2. Briefly describe your interest and how you'd like to contribute

Once approved, you can clone the repo directly and push branches without maintaining a fork.

---

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

---

## Development Workflow

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
- ✅ Follow [Code Style Standards](packages/docs/wiki/get-started/best-practices/code-style-standards.md)
- ✅ Follow [Architectural Patterns](packages/docs/wiki/get-started/best-practices/architectural-patterns.md)
- ✅ Add tests for new features/fixes
- ✅ Update docs in `packages/docs/wiki` if needed

### Step 3: Commit

Use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat: add Redis caching helper"
git commit -m "fix: correct JWT token validation"
git commit -m "docs: update controller examples"
git commit -m "chore: upgrade Hono to v4.0"
```

**Commit types:**

| Type | Description |
|------|-------------|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `docs:` | Documentation only |
| `chore:` | Maintenance (deps, config) |
| `refactor:` | Code restructuring |
| `test:` | Adding tests |

### Step 4: Validate

```bash
# Lint and format
bun run lint:fix

# Build packages
make build
```

---

## Coding Standards

### TypeScript Guidelines

- Use **strict TypeScript** - avoid `any` types
- Prefer **interfaces** over type aliases for object shapes
- Use **explicit return types** for public functions
- Follow consistent naming conventions

### Code Style

We use ESLint and Prettier via `@venizia/dev-configs`:

```bash
# Check code style
bun run lint

# Auto-fix issues
bun run lint:fix
```

For detailed standards, see [Code Style Standards](packages/docs/wiki/get-started/best-practices/code-style-standards.md).

---

## Submitting Pull Requests

### Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub targeting the `develop` branch.

### PR Guidelines

| Item | Description |
|------|-------------|
| **Title** | Use conventional commit format: `feat: add Redis caching` |
| **Description** | Explain what and why (not just how) |
| **Link issues** | Reference related issues: `Closes #123` |
| **Screenshots** | Include for UI changes |
| **Breaking changes** | Clearly mark and explain |

### PR Checklist

- [ ] All tests pass
- [ ] Code is linted and formatted
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow conventions
- [ ] Branch is up-to-date with `develop`

### Review Process

1. Maintainer reviews your PR (usually within 2-3 days)
2. Feedback or change requests may be provided
3. Address feedback and push updates
4. Once approved, maintainer merges to `develop`

---

## Getting Help

- **Documentation**: [packages/docs/wiki](packages/docs/wiki)
- **Issues**: Search [existing issues](https://github.com/VENIZIA-AI/ignis/issues) before creating new ones
- **Questions**: Use GitHub Discussions or Issues

---

Thank you for contributing to Ignis!
