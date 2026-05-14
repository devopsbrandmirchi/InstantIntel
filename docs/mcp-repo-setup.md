# MCP server setup (per repository)

This guide describes how to configure [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) servers **for a single repository** in Cursor, so everyone on the project can share the same server list and arguments while keeping secrets out of git.

## Where the config lives

| Scope | Typical location | Use case |
|--------|-----------------|----------|
| **This repo only** | `.cursor/mcp.json` | Team-aligned tools, same roots/paths for the project |
| User (all projects) | Cursor user MCP settings | Personal tokens, global tools |

Per-repo configuration uses **`.cursor/mcp.json`** at the repository root (next to your app code, not inside `node_modules`).

## Prerequisites

- **Cursor** with MCP support (use a current release; MCP UI lives under **Settings → MCP** or equivalent).
- For servers started with **`npx`** (common for official `@modelcontextprotocol/*` packages): **Node.js** installed and on the **PATH** used by Cursor (on Windows, confirm the same shell Cursor uses can run `npx -v`).

## File format

`mcp.json` is JSON with a top-level object and an **`mcpServers`** map. Each key is a **server id** (any stable name). Each value describes how Cursor **starts** that server over **stdio** (standard input/output).

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-example", "optional-root-path"],
      "env": {
        "OPTIONAL_ENV_VAR": "value"
      }
    }
  }
}
```

- **`command`**: Executable to run (e.g. `npx`, `node`, `uvx`, full path if needed).
- **`args`**: Arguments passed to that command, in order.
- **`env`**: Environment variables **only** for that server process (optional).

Official packages and patterns are documented in the [MCP servers repository](https://github.com/modelcontextprotocol/servers) and each server’s README.

## Example: filesystem (project root)

Exposing the repo root to the filesystem MCP server (`.` means “current workspace / project root” when Cursor launches the server from the project):

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

Restrict roots if you need tighter scope (some servers accept one or more directory paths).

## Example: GitHub (token via environment)

Do **not** commit real tokens. Prefer a **machine-local** or **CI-only** secret.

### Where to create the access token on GitHub

Create the token in the GitHub website (not in Cursor):

1. Sign in at [github.com](https://github.com).
2. Open your account **Settings**: click your **profile picture** (top-right) → **Settings**.
3. In the **left sidebar**, open **Developer settings** (near the bottom).
4. Under **Personal access tokens**, choose one:
   - **Fine-grained tokens** → **Generate new token** — pick the resource owner (your user or an org), which repositories the token can access, and the minimum **Repository permissions** (for private repos you need read/write as appropriate). This is usually the best default.
   - **Tokens (classic)** → **Generate new token (classic)** — enable scopes such as **`repo`** if you need private repositories; public-only work may need less.

Direct links (same pages as above):

- Fine-grained: [Personal access tokens (fine-grained)](https://github.com/settings/personal-access-tokens)
- Classic: [Personal access tokens (classic)](https://github.com/settings/tokens)

Which **permissions** to enable depends on what you do with MCP (issues only vs. private `repo` access, etc.); use the minimum needed and check the [`@modelcontextprotocol/server-github` README](https://www.npmjs.com/package/@modelcontextprotocol/server-github) if unsure.

After you click **Generate token**, GitHub shows the token **once**. Copy it immediately and store it in your OS environment variable or password manager; you cannot view it again from GitHub.

### Wire the token into Cursor

1. Set an environment variable on your machine, e.g. `GITHUB_PERSONAL_ACCESS_TOKEN` (Windows: **Settings → System → About → Advanced system settings → Environment variables**, or User variables; macOS/Linux: shell profile or `direnv`). Restart Cursor after changing user/system env vars so the MCP child process inherits them.
2. Reference it in `.cursor/mcp.json` if your Cursor build supports variable substitution, for example:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

If substitution is not supported in your version, keep tokens in **user-level** MCP config or document that each developer must set the same `env` key locally without committing values.

## Git and `.cursor/mcp.json`

Choose one approach:

1. **Commit** `.cursor/mcp.json` when it contains **no secrets** (only `command` / `args` / non-sensitive `env`). Good for sharing server names and args.
2. **Ignore** `.cursor/mcp.json` when it might contain tokens or machine-specific paths. This repo lists `.cursor/mcp.json` in `.gitignore`; then share a **template** (e.g. `docs/mcp-repo-setup.md` + `mcp.json.example` without secrets) so others can copy and fill locally.

Never commit PATs, API keys, or private URLs.

## After you save the file

1. Save `.cursor/mcp.json`.
2. **Reload** Cursor (**Command Palette → “Developer: Reload Window”**) or fully restart the app so MCP processes restart.
3. Open **Settings → MCP** (or the MCP status UI in your build) and confirm each server shows as connected. Errors often appear there (missing `npx`, auth failure, wrong path).

## Troubleshooting

| Symptom | Things to check |
|---------|------------------|
| Server not listed | Path is repo root `.cursor/mcp.json`; JSON valid (no trailing commas). |
| `npx` not found | Node on PATH for Cursor’s environment; restart terminal/Cursor after installing Node. |
| GitHub 401 / auth errors | PAT present for the process, scopes sufficient, token not expired; prefer env-based setup. |
| Filesystem denies paths | Server root args: you may need explicit allowed directories per server docs. |

## Further reading

- [Cursor MCP documentation](https://docs.cursor.com/context/model-context-protocol)
- [Model Context Protocol specification](https://spec.modelcontextprotocol.io/)
