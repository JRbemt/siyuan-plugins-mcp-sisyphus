# SiYuan MCP Sisyphus

[English](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README.md) | [中文](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/README_zh_CN.md)

A SiYuan Note MCP server plugin built around progressive disclosure — collapsing 41 scattered API endpoints into five aggregated tools: `notebook`, `document`, `block`, `file`, and `search`. Paired with a three-tier permission model (none / readonly / write) and mandatory confirmation gates on high-risk actions, it streamlines AI integration while keeping your note data safe — making automation more reliable and access control more precise.

- `notebook`
- `document`
- `block`
- `file`
- `search`

Each tool uses a required `action` field instead of exposing dozens of endpoint-shaped tool names.

## Features

- Full SiYuan API coverage for notebooks, documents, blocks, assets, export, and notifications
- A smaller MCP surface: 5 tools instead of 41 endpoint-level tools
- Action-level toggles in the plugin settings. In the default fallback config, delete-style actions are disabled while move actions stay enabled and confirmation-gated.
- Notebook- and document-level tree queries for direct child documents and blocks
- Full-text search, SQL queries, tag search, backlink and backmention queries
- Notebook permission guards now resolve block/document ownership before mutating APIs run

## Permission Model

- `write`: full read/write access
- `readonly`: read access only; all document and block writes are rejected
- `none`: no read or write access
- `notebook(action="set_permission")` takes effect immediately for later `notebook`, `document`, and `block` calls
- For AI regression runs, preheat all 5 tools early so permission prompts do not interrupt the middle of a test

## Timeline

- `v0.1.6`: Adds the `search` aggregated tool with full-text search, SQL queries, tag search, backlinks, and backmentions
- `v0.1.5`: Shrinks MCP exposure to 4 aggregated tools and adds notebook-level permission guards with high-risk action confirmations
- `v0.1.4`: Auto-generates the MCP config file on first install, so clients can connect out of the box
- `v0.1.3`: Removes unrelated config noise and keeps the plugin focused on MCP capabilities
- `v0.1.2`: Merges MCP tool config into one entry and adds dual-path fallback for more reliable loading

See full history in [CHANGELOG.md](./CHANGELOG.md).

## High-Risk Actions

The server instructions require explicit user confirmation before these actions are called:

- `notebook(action="remove")`
- `notebook(action="set_permission")`
- `document(action="remove")`
- `document(action="move")`
- `block(action="delete")`
- `block(action="move")`

If your client shows MCP instructions, the model should ask for confirmation before executing them.

In the default fallback config, `document(action="move")` and `block(action="move")` are still exposed. They are not safe to call without confirmation just because they are enabled.

## Installation

### From SiYuan Marketplace

1. Open SiYuan Note
2. Go to Settings > Marketplace
3. Search for `SiYuan MCP`
4. Install and enable the plugin

### From Source

```bash
git clone https://github.com/your-repo/siyuan-plugins-mcp-sisyphus.git
pnpm install
pnpm run build
pnpm run make-link
```

## MCP Client Configuration

```json
{
  "mcpServers": {
    "siyuan": {
      "command": "node",
      "args": ["/absolute/path/SiYuan/data/plugins/siyuan-plugins-mcp-sisyphus/mcp-server.cjs"]
    }
  }
}
```

The folder name in the path must match `plugin.json`: `siyuan-plugins-mcp-sisyphus`.

OpenClaw / mcporter users can follow [SKILL.md](https://github.com/yangtaihong59/siyuan-plugins-mcp-sisyphus/blob/main/skills/siyuan-mcp-sisyphus/SKILL.md).

## Tool Model

### `notebook`

| Action | Description |
|--------|-------------|
| `list` | List all notebooks |
| `create` | Create a new notebook (supports `icon`) |
| `open` / `close` | Open or close a notebook |
| `rename` | Rename a notebook |
| `get_conf` / `set_conf` | Get or set notebook configuration |
| `set_icon` | Set notebook emoji icon |
| `get_permissions` | List all notebook permission levels |
| `set_permission` | Change notebook MCP permission (`write` / `readonly` / `none`) |
| `get_child_docs` | Get direct child documents at notebook root |

### `document`

| Action | Description |
|--------|-------------|
| `create` | Create a document with markdown (supports `icon`) |
| `rename` | Rename a document by ID or storage path |
| `remove` | Remove a document by ID or storage path |
| `move` | Move documents by ID or storage path |
| `set_icon` | Set document or folder emoji icon |
| `get_path` | Get storage path by document ID |
| `get_hpath` | Get human-readable path by ID or storage path |
| `get_ids` | Get document IDs by human-readable path |
| `get_child_blocks` | Get direct child blocks of a document |
| `get_child_docs` | Get direct child documents of a document |

Path semantics: `create` and `get_ids` use human-readable paths (e.g., `/Inbox/Weekly Note`). `rename`, `remove`, `move`, and `get_hpath` can use either `id` or `notebook + storage path`.

### `block`

| Action | Description |
|--------|-------------|
| `insert` / `prepend` / `append` | Insert a block at position, start, or end |
| `update` | Update block content |
| `delete` | Delete a block |
| `move` | Move a block to a new position |
| `fold` / `unfold` | Fold or unfold a foldable block |
| `get_kramdown` | Get block content in kramdown format |
| `get_children` | Get direct child blocks |
| `transfer_ref` | Transfer block references |
| `set_attrs` / `get_attrs` | Set or get block attributes |

### `file`

| Action | Description |
|--------|-------------|
| `upload_asset` | Upload a file asset |
| `render_template` | Render a template with document context |
| `render_sprig` | Render a Sprig template |
| `export_md` | Export document as Markdown |
| `export_resources` | Export resources as ZIP |
| `push_msg` / `push_err_msg` | Push notification or error message |
| `get_version` / `get_current_time` | Get SiYuan version or current time |

### `search`

| Action | Description |
|--------|-------------|
| `fulltext` | Full-text search across blocks |
| `query_sql` | Execute read-only SQL (SELECT / WITH only) |
| `search_tag` | Search tags by keyword |
| `get_backlinks` | Find documents/blocks that reference a block |
| `get_backmentions` | Find documents/blocks that mention a block name |

## Tool Toggles

In SiYuan, open `Settings -> Plugins -> SiYuan MCP sisyphus`.

- Each aggregated tool has a top-level enable switch
- Each action can still be enabled or disabled individually
- The default fallback config exposes move actions but not delete-style actions
- Existing old-style configs are migrated automatically into the new format

## Development

Live smoke test against a local SiYuan instance:

```bash
pnpm run build
node scripts/live_mcp_smoke.cjs
```

```text
siyuan-plugins-mcp-sisyphus/
├── src/
│   ├── api/           # SiYuan API wrappers
│   ├── mcp/           # MCP server implementation
│   │   ├── tools/     # Aggregated tool handlers
│   │   ├── config.ts  # Tool config and migration helpers
│   │   ├── server.ts  # Main server
│   │   └── types.ts   # Action-level validation
│   └── index.ts       # Plugin entry point
├── public/i18n/       # Internationalization
└── package.json
```

## License

MIT
