import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, McpError, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';

import { SiYuanClient } from '../api/client';
import { buildDefaultToolConfig, formatDangerousActionsList, normalizeToolConfig, TOOL_CATEGORIES, type ToolCategory, type ToolConfig } from './config';
import { PermissionManager } from './permissions';
import { listHelpResources, listHelpResourceTemplates, readHelpResource } from './resources';
import { callBlockTool, listBlockTools } from './tools/block';
import { callDocumentTool, listDocumentTools } from './tools/document';
import { callFileTool, listFileTools } from './tools/file';
import { callNotebookTool, listNotebookTools } from './tools/notebook';
import { callSearchTool, listSearchTools } from './tools/search';
import { callSystemTool, listSystemTools } from './tools/system';
import { callTagTool, listTagTools } from './tools/tag';
import { earnPuppyBalance, readPuppyStats, writePuppyEvent } from './puppy-state';
import { callMascotTool, listMascotTools } from './tools/mascot';

const PLUGIN_CONFIG_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig';

function buildServerInstructions(): string {
    const dangerousActionsList = formatDangerousActionsList().join('\n');
    return `
## Help resources (progressive disclosure)

Each tool exposes common actions in its description. For detailed help on any action (including advanced ones), read:
- Per-action help: siyuan://help/action/{tool}/{action}
- Tool overview: siyuan://help/tool-overview
- Path semantics: siyuan://help/document-path-semantics
- Usage examples: siyuan://help/examples

## High-risk operations confirmation

Before calling any of the following actions, you MUST clearly describe the action to the user and wait for explicit confirmation. Do not call them without user confirmation.

**Actions that require confirmation:**
${dangerousActionsList}
- \`file(action="export_resources", outputPath=...)\`

Flow: State "I will do X. Proceed?" and only call the tool after the user explicitly agrees.

Additional rule:
- file(action="upload_asset") reads a local file path from the local filesystem and uploads it into SiYuan assets. Treat this as high-risk.
- If file(action="upload_asset") targets a file larger than the configured large-upload threshold (10 MB by default), you MUST stop the current operation, tell the user the file is too large to continue automatically, and only retry after explicit confirmation using confirmLargeFile=true.
- file(action="export_resources") without outputPath only asks SiYuan to generate a ZIP in its managed temp area.
- file(action="export_resources", outputPath=...) writes a file to the local filesystem and MUST be treated as high-risk even though the action itself is otherwise read-oriented.

Path semantics:
- document(action="create") uses a human-readable target path such as /Inbox/Weekly Note.
- Other document actions that take notebook + path use storage paths returned by document(action="get_path").

Block insertion semantics:
- block(action="prepend") with a document ID inserts at the start of the document.
- block(action="append") with a document ID inserts at the end of the document.
- With a block ID, prepend/append operate on that block's child list.

Tag creation semantics:
- There is no direct create action for tags.
- To create a real SiYuan tag in block markdown, use #标签# with both leading and trailing # characters.
- Example: block(action="update", dataType="markdown", data="#假期# #回家#")

Flashcard semantics:
- To mark a block as a flashcard, set the "custom-riff-decks" attribute with block(action="set_attrs", ...).
- A common pattern is to use an h2 heading as the question block and keep the following blocks as the answer.
- Example: block(action="set_attrs", id="20240318112233-abc123", attrs={"custom-riff-decks":"20230218211946-2kw8jgx"})
`;
}

const SERVER_INSTRUCTIONS = buildServerInstructions();


async function tryReadConfigFromAPI(client: SiYuanClient): Promise<ToolConfig | null> {
    try {
        const content = await client.readFile(PLUGIN_CONFIG_PATH);
        if (content) {
            return normalizeToolConfig(JSON.parse(content));
        }
    } catch {
        // Ignore missing or invalid config files.
    }
    return null;
}

function tryReadConfigFromFileSystem(): ToolConfig | null {
    const possiblePaths: string[] = [];
    const envDataDir = process.env.SIYUAN_DATA_DIR;
    if (envDataDir) {
        possiblePaths.push(path.join(envDataDir, 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
        possiblePaths.push(path.join(envDataDir, 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
    }

    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir) {
        possiblePaths.push(path.join(homeDir, 'SiYuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
        possiblePaths.push(path.join(homeDir, '.siyuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
        if (process.platform === 'win32') {
            const appData = process.env.APPDATA || '';
            if (appData) {
                possiblePaths.push(path.join(appData, 'SiYuan', 'data', 'storage', 'petal', 'siyuan-plugins-mcp-sisyphus', 'mcpToolsConfig'));
            }
        }
    }

    for (const configPath of possiblePaths) {
        if (!fs.existsSync(configPath)) continue;
        try {
            return normalizeToolConfig(JSON.parse(fs.readFileSync(configPath, 'utf-8')));
        } catch {
            // Ignore parse errors and continue with fallbacks.
        }
    }

    return null;
}

async function getToolConfig(client?: SiYuanClient): Promise<ToolConfig> {
    if (client) {
        const apiConfig = await tryReadConfigFromAPI(client);
        if (apiConfig) return apiConfig;
    }

    const fileConfig = tryReadConfigFromFileSystem();
    if (fileConfig) return fileConfig;

    const envConfig = process.env.SIYUAN_MCP_TOOLS;
    if (envConfig) {
        try {
            return normalizeToolConfig(JSON.parse(envConfig));
        } catch {
            // Ignore invalid env config.
        }
    }

    return buildDefaultToolConfig();
}

function getToolsByConfig(config: ToolConfig) {
    return [
        ...listNotebookTools(config.notebook),
        ...listDocumentTools(config.document),
        ...listBlockTools(config.block),
        ...listFileTools(config.file),
        ...listSearchTools(config.search),
        ...listTagTools(config.tag),
        ...listSystemTools(config.system),
        ...listMascotTools(config.mascot),
    ];
}

function asCategory(name: string): ToolCategory | null {
    return TOOL_CATEGORIES.includes(name as ToolCategory) ? (name as ToolCategory) : null;
}

async function initSiYuanClient(): Promise<SiYuanClient> {
    const client = new SiYuanClient();

    const envToken = process.env.SIYUAN_TOKEN;
    if (envToken) {
        client.setToken(envToken);
    }

    return client;
}

export async function createSiYuanServer(): Promise<Server> {
    const server = new Server(
        { name: 'siyuan-mcp', version: '2.0.0' },
        { capabilities: { tools: {}, resources: {} }, instructions: SERVER_INSTRUCTIONS.trim() },
    );

    const client = await initSiYuanClient();
    const permMgr = new PermissionManager(client);
    await permMgr.load();

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const config = await getToolConfig(client);
        return { tools: getToolsByConfig(config) };
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
        return { resources: listHelpResources() };
    });

    server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => {
        return { resourceTemplates: listHelpResourceTemplates() };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        const resource = readHelpResource(request.params.uri);
        if (!resource) {
            throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${request.params.uri}`);
        }
        return { contents: [resource] };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const action = typeof args?.action === 'string' ? args.action : 'unknown';
        const category = asCategory(name);
        if (!category) {
            return {
                content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }

        const config = await getToolConfig(client);
        if (!config[category].enabled) {
            return {
                content: [{ type: 'text' as const, text: `Tool "${name}" is disabled.` }],
                isError: true,
            };
        }

        const puppyStats = category === 'mascot'
            ? await readPuppyStats(client)
            : await earnPuppyBalance(client, `${name}/${action}`);

        await writePuppyEvent(client, {
            tool: name,
            action,
            status: 'running',
            totalCalls: puppyStats.totalCalls,
            balance: puppyStats.balance,
        });

        let result: { content: { type: 'text'; text: string }[]; isError?: boolean };
        switch (category) {
            case 'notebook': result = await callNotebookTool(client, args, config.notebook, permMgr); break;
            case 'document': result = await callDocumentTool(client, args, config.document, permMgr); break;
            case 'block': result = await callBlockTool(client, args, config.block, permMgr); break;
            case 'file': result = await callFileTool(client, args, config.file, permMgr); break;
            case 'search': result = await callSearchTool(client, args, config.search, permMgr); break;
            case 'tag': result = await callTagTool(client, args, config.tag, permMgr); break;
            case 'system': result = await callSystemTool(client, args, config.system, permMgr); break;
            case 'mascot': result = await callMascotTool(client, args, config.mascot, permMgr); break;
        }

        const latestStats = await readPuppyStats(client);
        let mascotEventMeta: { itemId?: string; itemLabel?: string; itemType?: string; itemEmoji?: string } = {};
        if (category === 'mascot' && !result.isError) {
            try {
                const payload = JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
                mascotEventMeta = {
                    itemId: typeof payload.item_id === 'string' ? payload.item_id : undefined,
                    itemLabel: typeof payload.item === 'string' ? payload.item : undefined,
                    itemType: typeof payload.type === 'string' ? payload.type : undefined,
                    itemEmoji: typeof payload.emoji === 'string' ? payload.emoji : undefined,
                };
            } catch {
                mascotEventMeta = {};
            }
        }
        await writePuppyEvent(client, {
            tool: name,
            action,
            status: result.isError ? 'error' : 'success',
            totalCalls: latestStats.totalCalls,
            balance: latestStats.balance,
            ...mascotEventMeta,
        });

        return result;
    });

    return server;
}

async function main() {
    process.on('uncaughtException', (error) => {
        console.error('[MCP] Uncaught exception:', error instanceof Error ? error.message : String(error));
    });

    process.on('unhandledRejection', (reason) => {
        console.error('[MCP] Unhandled rejection:', reason instanceof Error ? reason.message : String(reason));
    });

    const server = await createSiYuanServer();
    const transport = new StdioServerTransport(
        typeof process !== 'undefined' ? process.stdin : undefined,
        typeof process !== 'undefined' ? process.stdout : undefined,
    );
    await server.connect(transport);
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[MCP] Failed to start server:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    });
}
