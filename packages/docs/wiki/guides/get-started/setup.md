# Setup

Everything you need to start building with Ignis. This guide covers installation for macOS, Linux, and Windows (via WSL2).

## Requirements

| Tool | Version | Required | Notes |
|------|---------|----------|-------|
| **Bun** | >= 1.3 | Yes | Primary runtime, fastest performance |
| **Node.js** | >= 18 | Alternative | Use if Bun isn't available |
| **PostgreSQL** | >= 14 | Yes | Primary database |
| **VS Code** | Latest | Recommended | Best IDE experience with extensions |

## Install Runtime

### Bun (Recommended)

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash

# Windows (use WSL2)
# First install WSL2: wsl --install
# Then run the curl command above in WSL

# Verify
bun --version  # Should be 1.3+
```

### Node.js (Alternative)

```bash
# macOS (Homebrew)
brew install node@18

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Windows
# Download from https://nodejs.org/

# Verify
node --version  # Should be 18+
```

## Install PostgreSQL

### macOS

```bash
brew install postgresql@14
brew services start postgresql@14
```

### Ubuntu/Debian

```bash
sudo apt-get update
sudo apt-get install postgresql-14
sudo service postgresql start
```

### Windows

Download from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/) or use WSL2.

### Create Database

```bash
# macOS
psql postgres -c "CREATE DATABASE my_app_db;"

# Linux (Ubuntu/Debian)
sudo -u postgres psql -c "CREATE DATABASE my_app_db;"

# Verify
psql my_app_db -c "SELECT 1;"  # Should return 1
```

## VS Code Setup (Recommended)

### Extensions

```bash
# Essential
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode

# Recommended
code --install-extension usernamehw.errorlens
code --install-extension humao.rest-client
code --install-extension prisma.prisma  # Works with Drizzle too
```

### Settings

Create `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

## Verify Setup

```bash
bun --version      # >= 1.3 (or node --version >= 18)
psql --version     # >= 14
```

## Troubleshooting

### Bun not found after install

```bash
# Add to ~/.bashrc or ~/.zshrc
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Then reload
source ~/.bashrc  # or ~/.zshrc
```

### PostgreSQL permission denied

```bash
# Linux: Use sudo -u postgres
sudo -u postgres psql -c "CREATE DATABASE my_app_db;"

# macOS: Check if PostgreSQL is running
brew services list | grep postgresql
```

### PostgreSQL connection refused

```bash
# Check if running
pg_isready

# Start service
# macOS
brew services start postgresql@14

# Linux
sudo service postgresql start
```

## Next Steps

- [5-Minute Quickstart](./5-minute-quickstart.md) — Build your first API
- [Complete Installation](../tutorials/complete-installation.md) — Full project setup
