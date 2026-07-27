# Set Up Your Development Environment

Get your machine ready to build with IGNIS: a runtime, a database, and an editor. This guide
covers macOS, Linux, and Windows through WSL2.

## Requirements

| Tool | Version | Required | Why |
|------|---------|----------|-----|
| **Bun** | >= 1.3 | Yes | Installs packages and runs every build; IGNIS never uses npm, yarn, or pnpm |
| **PostgreSQL** | >= 14 | Yes | Primary database; the repository system assumes Drizzle + `pg` |
| **VS Code** | Latest | Optional | Best editor support, through ESLint and Prettier extensions |

> IGNIS apps can also run on Node.js 18+ in production, through `@hono/node-server`. That is a
> deployment choice, not a setup choice - Bun still installs packages and runs every command in
> this guide.

## Preconditions

- A terminal with permission to install packages (`sudo` on Linux, admin rights on Windows).
- On Windows, WSL2 installed (`wsl --install`). Run every command in this guide inside WSL2.

## Step 1: Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

On Windows, run this command inside WSL2.

Reload your shell, then confirm the version:

```bash
bun --version   # >= 1.3
```

## Step 2: Install PostgreSQL

Install and start the server for your OS.

macOS:

```bash
brew install postgresql@14
brew services start postgresql@14
```

Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install postgresql-14
sudo service postgresql start
```

Windows: download the installer from
[postgresql.org/download/windows](https://www.postgresql.org/download/windows/), or install
inside WSL2 with the Ubuntu/Debian commands above.

Then create a database for local development:

```bash
# macOS
psql postgres -c "CREATE DATABASE my_app_db;"

# Linux (Ubuntu/Debian)
sudo -u postgres psql -c "CREATE DATABASE my_app_db;"
```

## Step 3: Configure Your Editor (Optional)

Install the extensions that match IGNIS' ESLint and Prettier setup:

```bash
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension usernamehw.errorlens
code --install-extension humao.rest-client
```

Create `.vscode/settings.json` in your project:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

## Verify Your Setup

```bash
bun --version                   # >= 1.3
psql my_app_db -c "SELECT 1;"   # returns 1
```

Both commands must succeed before you continue.

## Troubleshooting

### Bun command not found after install

Add Bun to your shell profile, then reload it:

```bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
source ~/.bashrc   # or ~/.zshrc
```

### PostgreSQL: permission denied for database

Run the command as the `postgres` user:

```bash
sudo -u postgres psql -c "CREATE DATABASE my_app_db;"
```

### PostgreSQL: connection refused

Check that the server is running, then start it:

```bash
pg_isready

brew services start postgresql@14   # macOS
sudo service postgresql start       # Linux
```

## See Also

- [5-Minute Quickstart](./5-minute-quickstart.md) - build your first API
- [Complete Installation](../tutorials/complete-installation.md) - full project setup
