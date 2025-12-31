# Deployment Strategies

Deploy your Ignis application reliably, securely, and efficiently.

## 1. Building for Production

Compile TypeScript to JavaScript before deploying:

```bash
bun run build
```

**What this does:**
1. `tsc -p tsconfig.json` - Compile TypeScript → JavaScript
2. `tsc-alias -p tsconfig.json` - Replace path aliases (`@/*`) with relative paths

**Output:** `dist/` folder with production-ready JavaScript.

## 2. Environment Configuration

Use environment variables for all configuration - never hard-code.

**Production Environment Variables:**
| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `production` | Enables performance optimizations |
| `APP_ENV_APPLICATION_SECRET` | Strong random string | Application secret |
| `APP_ENV_JWT_SECRET` | Strong random string | JWT signing key |
| `APP_ENV_POSTGRES_*` | Production DB credentials | Database connection |
| `APP_ENV_SERVER_HOST` | `0.0.0.0` | Accept connections from any IP |
| `APP_ENV_SERVER_PORT` | `3000` or cloud-assigned | Server port |

**Where to store:**
- **Docker:** Use environment variables in `docker-compose.yml` or secrets
- **Kubernetes:** ConfigMaps and Secrets
- **Cloud Platforms:** AWS Secrets Manager, Azure Key Vault, Google Secret Manager

## 3. Deployment Methods

### Docker Deployment (Recommended)

**Dockerfile:**
```dockerfile
FROM oven/bun:1-slim

WORKDIR /usr/src/app

# Copy dependency files
COPY package.json bun.lockb ./

# Install production dependencies
RUN bun install --production --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN bun run build

# Expose port
EXPOSE 3000

# Start server
CMD [ "bun", "run", "server:prod" ]
```

**Build and deploy:**
```bash
# Build image
docker build -t my-ignis-app .

# Run container
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e APP_ENV_APPLICATION_SECRET=xxx \
  my-ignis-app
```

### Bun Single Executable (Alternative)

Compile your app into a single standalone binary:

```bash
bun build --compile --minify --target=bun-linux-x64 \
  ./src/index.ts --outfile ./dist/my-app
```

**Pros:** No dependencies needed on server, simple deployment
**Cons:** Platform-specific, newer technology (test thoroughly)

**Deploy:**
```bash
# Copy executable and .env to server
scp dist/my-app .env user@server:/app/

# Run
./my-app
```

## 4. Production Best Practices

**Use a process manager:**
- **systemd** - Linux service management (recommended for Bun)
- **Docker/Kubernetes** - Built-in orchestration
- **PM2** - Alternative option

**Example with systemd (Recommended for Bun):**
```ini
# /etc/systemd/system/my-app.service
[Unit]
Description=My Ignis Application
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/app
ExecStart=/usr/local/bin/bun run server:prod
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start the service
sudo systemctl enable my-app
sudo systemctl start my-app
sudo systemctl status my-app
```

**Example with PM2 (Alternative):**
```bash
pm2 start "bun run server:prod" --name my-app
pm2 save
pm2 startup
```

**Health checks:**
Add health check endpoint for load balancers:
```typescript
// In application.ts
this.component(HealthCheckComponent);
```

Access at `/health-check` for liveness/readiness probes.

## 5. Build Debugging

When builds fail or behave unexpectedly, use TypeScript's extended diagnostics:

```bash
# Show detailed build timing and statistics
tsc -p tsconfig.json --extendedDiagnostics
```

**Output includes:**
- File I/O time
- Parse time
- Program time
- Bind time
- Check time
- Emit time
- Total time

**Example output:**
```
Files:              245
Lines:            89432
Nodes:           412856
Identifiers:     156234
Symbols:          98765
Types:            34567
Instantiations:  123456
Memory used:    245678K
I/O Read time:     0.23s
Parse time:        1.45s
Program time:      2.34s
Bind time:         0.56s
Check time:        4.23s
Emit time:         0.89s
Total time:        8.47s
```

**Common issues:**
- High "Check time" → Type errors or complex type inference
- High "I/O Read time" → Too many files, check `include`/`exclude` patterns
- High "Instantiations" → Complex generic types, consider simplifying

## 6. Dependency Management

### Force Update Strategy

Keep dependencies in sync with the NPM registry using the force-update script:

```bash
# Update to latest stable versions
./scripts/force-update.sh latest

# Update to pre-release versions (for testing new features)
./scripts/force-update.sh next
```

**What it does:**
1. Queries NPM registry for the specified tag (`latest` or `next`)
2. Updates `package.json` with exact versions
3. Applies to all `@venizia/*` packages

**When to use:**
| Tag | Use Case |
|-----|----------|
| `latest` | Production deployments, stable releases |
| `next` | Testing new features, pre-release validation |

**Makefile shortcuts:**
```bash
make update           # Force update all packages (latest)
make update-core      # Update only @venizia/ignis
make update-helpers   # Update only @venizia/ignis-helpers
```

## 7. Test Environment Setup

Configure separate environment for testing:

### Create `.env.test`

```bash
# .env.test - Test environment variables
NODE_ENV=test
APP_ENV_APPLICATION_SECRET=test-secret-key
APP_ENV_JWT_SECRET=test-jwt-secret
APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_PORT=5433
APP_ENV_POSTGRES_USERNAME=test_user
APP_ENV_POSTGRES_PASSWORD=test_password
APP_ENV_POSTGRES_DATABASE=test_db
```

### Running Tests

```bash
# Run all tests with test environment
NODE_ENV=test bun test --env-file=.env.test

# Run tests in watch mode
NODE_ENV=test bun test --watch --env-file=.env.test

# Run specific test file
NODE_ENV=test bun test --env-file=.env.test src/__tests__/user.test.ts
```

### Test Database Setup

For integration tests, use a separate database:

```bash
# Docker: Start test database
docker run -d \
  --name ignis-test-db \
  -e POSTGRES_USER=test_user \
  -e POSTGRES_PASSWORD=test_password \
  -e POSTGRES_DB=test_db \
  -p 5433:5432 \
  postgres:16

# Run migrations on test database
NODE_ENV=test bun run migrate --env-file=.env.test
```

## 8. CI/CD Security

### Dependency Auditing

Integrate security audits into your CI/CD pipeline:

```yaml
# GitHub Actions example
name: Security Audit

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Run security audit
        run: bun audit

      - name: Check for vulnerabilities
        run: |
          if bun audit --json | jq '.vulnerabilities | length' | grep -v '^0$'; then
            echo "Vulnerabilities found!"
            exit 1
          fi
```

### Pre-deployment Checklist

```yaml
# GitHub Actions - Full CI pipeline
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - name: Install
        run: bun install

      - name: Lint
        run: bun run lint

      - name: Build
        run: bun run build

      - name: Test
        run: bun test --env-file=.env.test

      - name: Security Audit
        run: bun audit

      - name: Build Docker Image
        run: docker build -t my-app:${{ github.sha }} .
```

### Critical Packages to Monitor

| Package | Why | Check |
|---------|-----|-------|
| `hono` | Web framework, HTTP handling | Security advisories |
| `drizzle-orm` | Database queries, SQL injection | Version updates |
| `jose` | JWT handling, crypto | Vulnerability patches |
| `@venizia/ignis` | Framework core | Latest stable release |