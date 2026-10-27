# Set Up Your Development Environment

Get your machine ready to build with IGNIS: a runtime, a database, and an editor. This guide
covers macOS, Linux, and Windows through WSL2.

## Requirements

| Tool | Version | Required | Why |
|------|---------|----------|-----|
| **Bun** | >= 1.4 | Yes | Installs packages and runs every build; IGNIS never uses npm, yarn, or pnpm |
| **PostgreSQL** | Any supported version | For the CRUD tutorial | A server database. PGlite and SQLite run in-process and need no install |
| **VS Code** | Latest | Optional | Best editor support, through the Oxc and ESLint extensions |

> IGNIS runs on Bun >= 1.4 only. `ServerApplication.start()` throws on any other runtime.

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
bun --version   # >= 1.4
```

## Step 2: Install PostgreSQL (for the CRUD tutorial)

The quickstart and the installation tutorial need no database, so skip this step until the CRUD tutorial. To avoid installing a server at all, use [PGlite](../core-concepts/persistent/pglite) or [SQLite](../core-concepts/persistent/sqlite) instead.

Install and start the server for your OS. The commands below install version 14; any supported version works.

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

Install the extensions that match IGNIS' oxlint and ESLint setup:

```bash
code --install-extension dbaeumer.vscode-eslint
code --install-extension oxc.oxc-vscode
code --install-extension usernamehw.errorlens
code --install-extension humao.rest-client
```

Create `.vscode/settings.json` in your project:

```json
{
  "oxc.configPath": ".configs/lints/oxlint.config.mts",
  "oxc.typeAware": true,
  "eslint.options": { "overrideConfigFile": ".configs/lints/eslint.config.mjs" },
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

The tools do not look inside `.configs/` on their own, so the settings point at each file. The paths resolve against the folder VS Code opened: open the project folder itself.

## Verify Your Setup

```bash
bun --version                   # >= 1.4
psql my_app_db -c "SELECT 1;"   # returns 1 (only if you installed PostgreSQL)
```

The first command must succeed before you continue.

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
