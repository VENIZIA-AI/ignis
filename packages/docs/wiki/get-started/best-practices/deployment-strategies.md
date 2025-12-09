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
FROM node:20-slim

WORKDIR /usr/src/app

# Copy dependency files
COPY package.json bun.lockb ./

# Install production dependencies
RUN bun install --production

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
- **PM2** - For Node.js/Bun processes
- **systemd** - Linux service management
- **Docker/Kubernetes** - Built-in orchestration

**Example with PM2:**
```bash
pm2 start dist/index.js --name my-app -i max
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