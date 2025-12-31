# Getting Started with Ignis Docs MCP Server

> **What is this?** An MCP (Model Context Protocol) server that lets AI assistants access Ignis framework documentation in real-time. Your AI gets the latest docs instead of outdated training data.

## What You'll Need

Before starting, ensure you have:

- **Bun** (recommended) or **Node.js** installed (for running the MCP server)
- **An AI tool** that supports MCP (Claude Code CLI, VS Code with MCP extensions, etc.)

## Quick Start (5 minutes)

### Step 1: Choose Your AI Tool

Pick which AI assistant you're using:

| Tool                                  | Best For                                 |
| ------------------------------------- | ---------------------------------------- |
| [Claude Code](#claude-code-cli-setup) | Terminal users, developers (Recommended) |
| [Gemini CLI](#gemini-cli-setup)       | Google AI users                          |
| [VS Code](#vs-code-setup)             | VS Code with MCP extensions              |
| [Cursor](#cursor-setup)               | AI-first code editor                     |
| [Windsurf](#windsurf-setup)           | Codeium's AI editor                      |
| [JetBrains IDEs](#jetbrains-setup)    | IntelliJ, PyCharm, WebStorm              |

### Step 2: Install the MCP Server

Choose one installation method:

#### Option A: Bun (Recommended)

```bash
# Global installation
bun add -g @venizia/ignis-docs

# Or run without installation
bun x -p @venizia/ignis-docs@latest ignis-docs-mcp
```

#### Option B: NPM

```bash
# Global installation
npm install -g @venizia/ignis-docs

# Or use npx (no installation needed)
npx -y @venizia/ignis-docs
```

#### Option C: Yarn

```bash
# Global installation
yarn global add @venizia/ignis-docs

# Or use npx (no installation needed)
npx -y @venizia/ignis-docs
```

#### Option D: pnpm

```bash
# Global installation
pnpm add -g @venizia/ignis-docs

# Or use pnpm dlx (no installation needed)
pnpm dlx @venizia/ignis-docs
```

### Branch Configuration (Optional)

By default, the MCP server fetches source code from the `main` branch. To use a different branch:

```bash
# Global install - pass branch as argument
ignis-docs-mcp develop

# Using bun x
bun x -p @venizia/ignis-docs@latest ignis-docs-mcp develop

# Using npx
npx -y @venizia/ignis-docs develop
```

In your MCP config, add the branch as an argument:

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "bun",
      "args": ["x", "-p", "@venizia/ignis-docs@latest", "ignis-docs-mcp"]
    }
  }
}
```

### Step 3: Configure Your AI Tool

Choose your tool below and follow the specific instructions.

## Claude Code CLI Setup

**What is Claude Code?** A command-line interface for Claude that you're likely using right now if you're reading this in a terminal.

### Prerequisites

1. **Install Claude Code CLI** (if not already installed):

   ```bash
   # macOS/Linux
   curl -fsSL https://code.claude.ai/install.sh | sh

   # Or download from: https://claude.ai/claude-code
   ```

2. **Verify installation:**
   ```bash
   claude --version
   ```

### Setup Steps

#### 1. Find your Claude Code config directory

```bash
# The config file location:
# macOS/Linux: ~/.config/claude-code/config.json
# Windows: %USERPROFILE%\.config\claude-code\config.json

# Check if it exists:
ls ~/.config/claude-code/config.json

# If the directory doesn't exist, create it:
mkdir -p ~/.config/claude-code
```

#### 2. Edit the config file

**Option A: Using npx (Recommended - no global install needed):**

```bash
# Open config in your editor
nano ~/.config/claude-code/config.json
# Or: vim, code, etc.
```

Add this configuration:

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "npx",
      "args": ["-y", "@venizia/ignis-docs"]
    }
  }
}
```

**Option B: Using global install:**

First install globally:

```bash
npm install -g @venizia/ignis-docs
```

Then configure:

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "ignis-docs-mcp"
    }
  }
}
```

**Option C: Using bun x (Recommended):**

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "bun",
      "args": ["x", "-p", "@venizia/ignis-docs@latest", "ignis-docs-mcp"]
    }
  }
}
```

**Option D: Using bun x with specific branch:**

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "bun",
      "args": ["x", "-p", "@venizia/ignis-docs@latest", "ignis-docs-mcp", "develop"]
    }
  }
}
```

#### 3. Verify the setup

Restart your Claude Code session (close terminal and reopen), then test:

```bash
# In your Claude Code session, ask:
Can you search the Ignis docs for "dependency injection"?
```

**Expected behavior:**

- Claude Code should use the `searchDocs` tool
- You'll see a message like: `[Using tool: searchDocs]`
- Results from Ignis documentation appear

**If it doesn't work:**

- Check the config file has valid JSON: `cat ~/.config/claude-code/config.json | python -m json.tool`
- Check MCP server is accessible: `npx @venizia/ignis-docs` (should show "MCP Server running...")
- Check logs: `claude --debug` to see MCP initialization logs

#### 4. Example usage

Once working, try these queries:

```
# Search documentation
"How do I create a controller in Ignis?"

# Get specific guide
"Show me the complete Building a CRUD API guide"

# Browse topics
"What helpers are available in Ignis?"

# Get code examples
"Show me an example of dependency injection in Ignis"
```

## Gemini CLI Setup

> **Important:** As of December 2024, Google's official Gemini CLI has limited MCP support. This setup is **experimental** and may require custom configuration.

### Prerequisites

1. **Install Google AI CLI tools:**

   ```bash
   # Option 1: Using pip (Python)
   pip install google-generativeai

   # Option 2: Using Node.js wrapper
   npm install -g @google/generative-ai
   ```

2. **Get your API key:**
   - Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
   - Create a new API key
   - Save it securely

### Setup Steps

#### 1. Configure environment

```bash
# Set your API key
export GOOGLE_API_KEY="your-api-key-here"

# Or add to your shell config (~/.bashrc, ~/.zshrc):
echo 'export GOOGLE_API_KEY="your-api-key-here"' >> ~/.bashrc
source ~/.bashrc
```

#### 2. Create MCP config directory

```bash
# Create config directory
mkdir -p ~/.config/gemini

# The config file location:
# macOS/Linux: ~/.config/gemini/mcp_servers.json
# Windows: %USERPROFILE%\.config\gemini\mcp_servers.json
```

#### 3. Add MCP Server Configuration

Create `~/.config/gemini/mcp_servers.json`:

**Recommended: Using npx**

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "npx",
      "args": ["-y", "@venizia/ignis-docs"],
      "env": {}
    }
  }
}
```

**Alternative: Global install**

```bash
# First install globally
npm install -g @venizia/ignis-docs
```

Then configure:

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "ignis-docs-mcp",
      "env": {}
    }
  }
}
```

#### 4. Test manually first

Before integrating with Gemini, test the MCP server works:

```bash
# Test the MCP server can start
npx @venizia/ignis-docs

# Expected output:
# "MCP Server listening on stdio..."
# (Press Ctrl+C to stop)
```

#### 5. Use with Gemini (if supported)

**⚠️ Note:** MCP support in Gemini CLI is limited. Alternative approaches:

**Option A: Use Google AI Python SDK with custom MCP wrapper**

```python
# This requires writing custom integration code
# See: https://github.com/modelcontextprotocol/python-sdk
```

**Option B: Use via Claude Code CLI instead**

- Gemini CLI MCP support is experimental
- Claude Code has better MCP support out of the box
- Recommendation: Use [Claude Code CLI setup](#claude-code-cli-setup) for Ignis docs

#### Troubleshooting

**❌ "Command not found: gemini"**

- Google doesn't have an official "gemini" CLI command
- Use `gcloud ai` or Python SDK instead
- Consider using Claude Code CLI for better MCP support

**❌ MCP server not loading**

- Gemini CLI MCP support is experimental
- Check if your Gemini CLI version supports MCP:
  ```bash
  gemini --version
  gemini mcp list  # If this command doesn't exist, MCP isn't supported
  ```

**✅ Recommended Alternative:**
Use Claude Code CLI (see setup above) - it has full MCP support and works reliably.

## VS Code Setup

VS Code supports MCP through various extensions. The setup process is similar to Microsoft's Playwright MCP integration.

### Prerequisites

Install an MCP-compatible extension from the VS Code marketplace:

- **[Continue](https://marketplace.visualstudio.com/items?itemName=Continue.continue)** - AI assistant with MCP support
- **[Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev)** - Claude-powered autonomous coding agent
- Or any other VS Code extension that supports the Model Context Protocol

### Configuration

The configuration location depends on which extension you're using:

**For Continue extension:**

- **macOS/Linux:** `~/.continue/config.json`
- **Windows:** `%USERPROFILE%\.continue\config.json`

**For Cline extension:**

- **macOS/Linux:** `~/.cline/config.json`
- **Windows:** `%USERPROFILE%\.cline\config.json`

**For other MCP extensions:**

- Check the extension's documentation for the config file location

### Add MCP Server Configuration

Open the config file for your extension and add the Ignis docs server:

**If you installed globally:**

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "ignis-docs-mcp"
    }
  }
}
```

**If using npx (recommended for most users):**

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "npx",
      "args": ["-y", "@venizia/ignis-docs"]
    }
  }
}
```

**If using bun x (Recommended):**

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "bun",
      "args": ["x", "-p", "@venizia/ignis-docs@latest", "ignis-docs-mcp"]
    }
  }
}
```

### Restart VS Code

Reload the window: `Cmd/Ctrl + Shift + P` → "Developer: Reload Window"

### Verify it's working

Open your AI assistant in VS Code and ask:

```
Can you search the Ignis docs for "dependency injection"?
```

The assistant should use the MCP tools to access and return documentation.

## Cursor Setup

### Prerequisites

- Install the MCP extension from Cursor's extension marketplace

### Configuration

**Config File:** Check Cursor's MCP settings (usually `.cursor/mcp_config.json`)

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "ignis-docs-mcp"
    }
  }
}
```

### Restart Cursor

## Windsurf Setup

### Prerequisites

- Download and install [Windsurf](https://codeium.com/windsurf) by Codeium

### Configuration

**Config File:**

- **macOS:** `~/Library/Application Support/Windsurf/mcp_config.json`
- **Windows:** `%APPDATA%\Windsurf\mcp_config.json`
- **Linux:** `~/.config/Windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "ignis-docs-mcp"
    }
  }
}
```

**If using npx:**

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "npx",
      "args": ["-y", "@venizia/ignis-docs"]
    }
  }
}
```

### Restart Windsurf

## JetBrains Setup

### Prerequisites

- IntelliJ IDEA, PyCharm, WebStorm, or any JetBrains IDE with AI Assistant plugin
- Install the [MCP Support Plugin](https://plugins.jetbrains.com/plugin/mcp-support) (check JetBrains marketplace)

### Configuration

**Config File Location:**

- **macOS:** `~/Library/Application Support/JetBrains/<IDE>/mcp_config.json`
- **Windows:** `%APPDATA%\JetBrains\<IDE>\mcp_config.json`
- **Linux:** `~/.config/JetBrains/<IDE>/mcp_config.json`

Replace `<IDE>` with your IDE name (e.g., `IntelliJIdea2024.1`, `PyCharm2024.1`).

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "ignis-docs-mcp"
    }
  }
}
```

**If using npx:**

```json
{
  "mcpServers": {
    "ignis-docs": {
      "command": "npx",
      "args": ["-y", "@venizia/ignis-docs"]
    }
  }
}
```

### Restart Your IDE

## Usage Examples

Once configured, you can ask your AI assistant:

### Example 1: Search Documentation

```
You: "How do I set up dependency injection in Ignis?"
AI: [Uses searchDocs tool, finds relevant pages]
AI: "Based on the Ignis documentation..."
```

### Example 2: Get Specific Guide

```
You: "Show me the full Quickstart guide"
AI: [Uses listDocs to find ID, then getDocContent]
AI: "Here's the complete Quickstart guide..."
```

### Example 3: Browse by Category

```
You: "What documentation is available for helpers?"
AI: [Uses listCategories, then listDocs with category filter]
AI: "The Helpers category contains: Redis, Logger, Queue..."
```


## Local Development Setup

For contributors or those developing Ignis itself:

### 1. Clone the Ignis repository

```bash
git clone https://github.com/venizia-ai/ignis.git
cd ignis
```

### 2. Install dependencies

```bash
bun install
```

### 3. Run the MCP server in dev mode

```bash
bun run docs:mcp:dev
```

### 4. Configure your AI tool

Use absolute paths in your config:

**macOS/Linux:**

```json
{
  "mcpServers": {
    "ignis-docs-dev": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/ignis/packages/docs/mcp-server/index.ts"]
    }
  }
}
```

**Windows:**

```json
{
  "mcpServers": {
    "ignis-docs-dev": {
      "command": "bun",
      "args": ["run", "C:\\absolute\\path\\to\\ignis\\packages\\docs\\mcp-server\\index.ts"]
    }
  }
}
```


## Comprehensive Troubleshooting Guide

### Testing Your Setup (Start Here!)

Before troubleshooting, run these quick tests:

**✅ Test 1: MCP server runs**

```bash
npx @venizia/ignis-docs
# Expected: "MCP Server listening on stdio..."
# Press Ctrl+C to stop
```

**✅ Test 2: Config file exists and is valid JSON**

```bash
# Claude Code:
cat ~/.config/claude-code/config.json | python -m json.tool
```

**✅ Test 3: AI tool recognizes MCP server**

- Restart your AI tool COMPLETELY (quit and reopen)
- Ask: `Can you search the Ignis docs for "controller"?`
- Look for: `[Using tool: searchDocs]`


### Common Issues and Solutions

#### ❌ Issue #1: "Command not found: ignis-docs-mcp"

**When it happens:** Starting AI tool or running `ignis-docs-mcp` manually

**Why:** Global npm package not in your system PATH

**Solutions (try in order):**

1. **Use npx instead** (recommended):

   ```json
   {
     "mcpServers": {
       "ignis-docs": {
         "command": "npx",
         "args": ["-y", "@venizia/ignis-docs"]
       }
     }
   }
   ```

2. **Check if installed:**

   ```bash
   npm list -g @venizia/ignis-docs
   # Should show: @venizia/ignis-docs@x.x.x
   ```

3. **Find executable location:**

   ```bash
   # macOS/Linux:
   which ignis-docs-mcp
   # Windows:
   where ignis-docs-mcp
   ```

4. **Reinstall:**
   ```bash
   npm uninstall -g @venizia/ignis-docs
   npm install -g @venizia/ignis-docs
   ```


#### ❌ Issue #2: AI assistant doesn't use MCP tools

**When it happens:** AI responds normally but never uses `searchDocs` or other tools

**Diagnosis:**

1. **Wrong config file location**

   ```bash
   # Verify you edited the right file:
   # Claude Code:
   ls -la ~/.config/claude-code/config.json
   ```

2. **Invalid JSON syntax**

   ```bash
   # Test JSON validity:
   cat ~/.config/claude-code/config.json | python -m json.tool
   # If error: Fix the JSON syntax
   ```

   **Common JSON mistakes:**

   ```json
   // ❌ WRONG: Missing comma
   {
     "mcpServers": {
       "ignis-docs": {
         "command": "npx"  // Missing comma!
         "args": ["-y", "@venizia/ignis-docs"]
       }
     }
   }

   // ✅ CORRECT:
   {
     "mcpServers": {
       "ignis-docs": {
         "command": "npx",
         "args": ["-y", "@venizia/ignis-docs"]
       }
     }
   }
   ```

3. **AI tool not restarted properly**
   - **Claude Code:** Close terminal, open new one
   - **VS Code:** Cmd/Ctrl+Shift+P → "Developer: Reload Window"

4. **MCP server doesn't start**
   ```bash
   # Test manually:
   npx @venizia/ignis-docs
   # Should NOT error. Press Ctrl+C to stop.
   ```


#### ❌ Issue #3: "Module not found" errors

**When it happens:** MCP server starts but crashes immediately

**Solutions:**

1. **Update package:**

   ```bash
   npm update -g @venizia/ignis-docs
   ```

2. **Clear cache and reinstall:**

   ```bash
   npm cache clean --force
   npm uninstall -g @venizia/ignis-docs
   npm install -g @venizia/ignis-docs
   ```

3. **Check Node.js version:**

   ```bash
   node --version
   # Must be v18.0.0 or higher
   ```

4. **Try Bun instead:**
   ```bash
   bun x -p @venizia/ignis-docs@latest ignis-docs-mcp
   ```


#### ❌ Issue #4: First search takes 10+ seconds

**When it happens:** First query is slow, subsequent queries are fast

**This is NORMAL!** Here's why:

- **First search:** Loads all docs into memory (~3-5 seconds)
- **Later searches:** Uses cache (~0.5 seconds)

**Not an error - just one-time startup cost.**


#### ❌ Issue #5: Config file doesn't exist

**When it happens:** `cat ~/.config/claude-code/config.json` says "No such file"

**Solution:** Create it manually

```bash
# Claude Code:
mkdir -p ~/.config/claude-code
cat > ~/.config/claude-code/config.json <<'EOF'
{
  "mcpServers": {
    "ignis-docs": {
      "command": "npx",
      "args": ["-y", "@venizia/ignis-docs"]
    }
  }
}
EOF
```


### 🐛 Advanced Troubleshooting

If none of the above worked:

**1. Enable debug mode:**

```bash
DEBUG=1 npx @venizia/ignis-docs
```

**2. Check AI tool logs:**

- **Claude Code:** Run with `claude --debug`

**3. Test with minimal config:**

```json
{
  "mcpServers": {
    "test-echo": {
      "command": "echo",
      "args": ["Hello from MCP"]
    }
  }
}
```

If this works, the issue is specific to `@venizia/ignis-docs`.

**4. Report the bug:**

- GitHub: https://github.com/venizia-ai/ignis/issues
- Include:
  - OS and version
  - Node.js version: `node --version`
  - Error messages
  - Your config file (remove secrets)


## What's Next?

- **Learn the Tools:** Read the [Deep Dive Guide](/references/src-details/mcp-server) to understand all 5 available tools
- **Advanced Usage:** Explore how to chain tools for complex documentation queries
- **Contribute:** Help improve the docs or add new features


## FAQ

### Do I need to install anything besides the npm package?

No. The package includes everything needed. Just configure your AI tool.

### Does this work offline?

Yes, once installed. The documentation is bundled with the package.

### How often is the documentation updated?

When you update the package (`npm update -g @venizia/ignis-docs`), you get the latest docs.

### Can I use multiple MCP servers?

Yes! Add more servers to the `mcpServers` object in your config file.

### What's the difference between the tools?

| Tool | Use When |
| -------------------- | ----------------------------------------- |
| `searchDocs` | You know a keyword but not the page |
| `getDocContent` | You know the exact page you need |
| `listDocs` | You want to browse available docs |
| `listCategories` | You want to explore by topic |
| `getDocMetadata` | You need doc stats (length, last updated) |
| `getPackageOverview` | You want a summary of a package |
| `searchCode` | You want to search source code |
| `listProjectFiles` | You want to see the project structure |
| `viewSourceFile` | You want to read a source file |
| `verifyDependencies` | You want to check package dependencies |
