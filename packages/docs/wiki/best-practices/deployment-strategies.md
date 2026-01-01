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

### Docker Compose (Full Stack)

For complete development and staging environments with database:

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - APP_ENV_APPLICATION_SECRET=${APP_SECRET}
      - APP_ENV_JWT_SECRET=${JWT_SECRET}
      - APP_ENV_POSTGRES_HOST=db
      - APP_ENV_POSTGRES_PORT=5432
      - APP_ENV_POSTGRES_USERNAME=ignis
      - APP_ENV_POSTGRES_PASSWORD=${DB_PASSWORD}
      - APP_ENV_POSTGRES_DATABASE=ignis_db
      - APP_ENV_REDIS_HOST=redis
      - APP_ENV_REDIS_PORT=6379
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health-check"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=ignis
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=ignis_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ignis -d ignis_db"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

**Deploy with docker-compose:**
```bash
# Create .env file with secrets
echo "APP_SECRET=$(openssl rand -base64 32)" > .env
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env
echo "DB_PASSWORD=$(openssl rand -base64 24)" >> .env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Scale app (for load testing)
docker-compose up -d --scale app=3
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

## 9. Cloud Platform Deployments

### Railway

Railway provides simple deployments with automatic builds:

**railway.json:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "bun run server:prod",
    "healthcheckPath": "/health-check",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

```bash
# Deploy to Railway
railway login
railway init
railway up
```

### Fly.io

**fly.toml:**
```toml
app = "my-ignis-app"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 1

[[services]]
  protocol = "tcp"
  internal_port = 3000

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

  [[services.http_checks]]
    interval = 10000
    grace_period = "5s"
    method = "get"
    path = "/health-check"
    protocol = "http"
    timeout = 2000
```

```bash
# Deploy to Fly.io
fly auth login
fly launch
fly deploy
fly secrets set APP_ENV_APPLICATION_SECRET=xxx
```

### Render

**render.yaml:**
```yaml
services:
  - type: web
    name: my-ignis-app
    runtime: docker
    dockerfilePath: ./Dockerfile
    envVars:
      - key: NODE_ENV
        value: production
      - key: APP_ENV_APPLICATION_SECRET
        generateValue: true
      - key: APP_ENV_JWT_SECRET
        generateValue: true
    healthCheckPath: /health-check
    autoDeploy: true

databases:
  - name: ignis-db
    databaseName: ignis
    user: ignis
    plan: starter
```

### Kubernetes

**k8s/deployment.yaml:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ignis-app
  labels:
    app: ignis
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ignis
  template:
    metadata:
      labels:
        app: ignis
    spec:
      containers:
        - name: ignis
          image: my-ignis-app:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: APP_ENV_APPLICATION_SECRET
              valueFrom:
                secretKeyRef:
                  name: ignis-secrets
                  key: app-secret
            - name: APP_ENV_JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: ignis-secrets
                  key: jwt-secret
            - name: APP_ENV_POSTGRES_HOST
              valueFrom:
                configMapKeyRef:
                  name: ignis-config
                  key: db-host
          livenessProbe:
            httpGet:
              path: /health-check
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /health-check
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          resources:
            requests:
              memory: "256Mi"
              cpu: "200m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: ignis-service
spec:
  selector:
    app: ignis
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

**Deploy to Kubernetes:**
```bash
# Create secrets
kubectl create secret generic ignis-secrets \
  --from-literal=app-secret=$(openssl rand -base64 32) \
  --from-literal=jwt-secret=$(openssl rand -base64 32)

# Create configmap
kubectl create configmap ignis-config \
  --from-literal=db-host=postgres-service

# Apply deployment
kubectl apply -f k8s/

# Check status
kubectl get pods -l app=ignis
kubectl logs -l app=ignis -f
```

## 10. Monitoring & Observability

### Health Check Endpoints

Ignis provides built-in health checks:

```typescript
// In application.ts
import { HealthCheckComponent } from '@venizia/ignis';

this.component(HealthCheckComponent);
```

**Endpoints:**
- `GET /health-check` - Basic liveness check
- `GET /health-check/ready` - Readiness (includes DB connection)

### Logging in Production

Configure structured logging:

```typescript
import { LoggerFactory } from '@venizia/ignis-helpers';

// Set log level via environment
// APP_ENV_LOG_LEVEL=info (debug, info, warn, error)

const logger = LoggerFactory.getLogger(['MyService']);
logger.info('Service started', { port: 3000, env: 'production' });
```

### Metrics Collection

Add Prometheus metrics endpoint:

```typescript
// src/controllers/metrics.controller.ts
@controller({ path: '/metrics' })
export class MetricsController extends BaseController {
  @get({ configs: { path: '/' } })
  getMetrics(c: Context) {
    return c.text(`
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} ${requestCount}

# HELP process_uptime_seconds Process uptime
# TYPE process_uptime_seconds gauge
process_uptime_seconds ${process.uptime()}
    `);
  }
}
```

## Summary

| Deployment Method | Best For | Complexity |
|-------------------|----------|------------|
| **Docker** | General production | Low |
| **Docker Compose** | Full stack with DB | Low |
| **Bun Executable** | Simple servers | Very Low |
| **Railway/Render** | Quick deployments | Very Low |
| **Fly.io** | Edge deployments | Low |
| **Kubernetes** | Enterprise scale | High |

Choose based on your scale and operational requirements.