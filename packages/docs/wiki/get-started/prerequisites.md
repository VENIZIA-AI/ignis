# Prerequisites

Before starting with Ignis, ensure you have the following installed and configured.

> **New to Ignis?** This is a TypeScript REST API framework that combines enterprise patterns with high performance. [Learn more about the philosophy](./philosophy.md).

## Required Software

| Tool | Version | Purpose | Installation |
|------|---------|---------|--------------|
| **Bun** | ≥ 1.3 | JavaScript runtime & package manager | [bun.sh](https://bun.sh) |
| **PostgreSQL** | ≥ 14.x | Database server for storing your data | [postgresql.org/download](https://www.postgresql.org/download/) |

### Installation Quick Links

**Bun:**
```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows (requires WSL)
# First install WSL, then run the command above
```

**PostgreSQL:**
- **macOS:** `brew install postgresql@14` (requires [Homebrew](https://brew.sh))
- **Ubuntu/Debian:** `sudo apt-get install postgresql-14`
- **Windows:** Download installer from [postgresql.org](https://www.postgresql.org/download/windows/)

### Verify Installation

After installing, verify everything works:

```bash
# Check Bun
bun --version
# Expected: 1.3.0 or higher

# Check PostgreSQL
psql --version
# Expected: psql (PostgreSQL) 14.x or higher
```

## Required Knowledge

You should be comfortable with:

- **TypeScript basics** - Variables, functions, classes, interfaces
- **REST APIs** - What GET, POST, PUT, DELETE mean
- **Async/await** - Handling asynchronous code in JavaScript
- **SQL basics** - What a database table is, basic SELECT/INSERT/UPDATE/DELETE

**Don't have these?** You can still follow along, but consider bookmarking these resources:
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [REST API Tutorial](https://restfulapi.net/)

## Database Setup

Create a database for your application:

```bash
# Start PostgreSQL service (if not already running)
# macOS with Homebrew:
brew services start postgresql@14

# Ubuntu/Debian:
sudo service postgresql start

# Connect to PostgreSQL
psql -U postgres

# Inside psql, create your database:
CREATE DATABASE my_app_db;

# Verify it was created:
\l

# Exit psql:
\q
```

**What just happened?**
- `psql -U postgres` - Connect as the default "postgres" superuser
- `CREATE DATABASE my_app_db;` - Creates an empty database to store your app's data
- `\l` - Lists all databases (you should see `my_app_db` in the list)

**Troubleshooting:**
- **"postgres" user doesn't exist?** Try `psql -U your_username` (your system username)
- **Password prompt?** Default PostgreSQL installations often have no password. If prompted, check your installation docs.
- **Connection refused?** PostgreSQL service isn't running. Check the `brew services start` or `sudo service postgresql start` command.

## Text Editor Setup (Optional but Recommended)

Any editor works, but **VS Code** has the best TypeScript support:

1. Install [VS Code](https://code.visualstudio.com/)
2. Install these extensions:
   - **ESLint** - Catches code errors
   - **Prettier** - Auto-formats code
   - **TypeScript + JavaScript** - Built-in, enables autocomplete

## Ready to Start?

✅ Bun installed and working
✅ PostgreSQL installed and running
✅ Database created
✅ Basic TypeScript knowledge

Continue to the [Quickstart Guide](./quickstart.md) to build your first API!

**Alternative paths:**
- Want to understand "why Ignis"? Read [Philosophy](./philosophy.md) first
- Want to see the full picture? Check [Getting Started Overview](./index.md)
