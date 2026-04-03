import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ListToolsRequestSchema, McpError, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';

import { SiYuanClient } from '../api/client';
import { buildDefaultToolConfig, normalizeToolConfig, TOOL_CATEGORIES, type ToolCategory, type ToolConfig } from './config';
import { PermissionManager } from './permissions';
import { listHelpResources, listHelpResourceTemplates, readHelpResource } from './resources';
import { callBlockTool, listBlockTools } from './tools/block';
import { callDocumentTool, listDocumentTools } from './tools/document';
import { callFileTool, listFileTools } from './tools/file';
import { callNotebookTool, listNotebookTools } from './tools/notebook';
import { callSearchTool, listSearchTools } from './tools/search';
import { callSystemTool, listSystemTools } from './tools/system';
import { callTagTool, listTagTools } from './tools/tag';

const PLUGIN_CONFIG_PATH = '/data/storage/petal/siyuan-plugins-mcp-sisyphus/mcpToolsConfig';

const SERVER_INSTRUCTIONS = `
## High-risk operations confirmation

Before calling any of the following actions, you MUST clearly describe the action to the user and wait for explicit confirmation. Do not call them without user confirmation.

**Actions that require confirmation:**
- notebook(action="remove")
- document(action="remove"), document(action="move")
- block(action="delete"), block(action="move")
- tag(action="remove")
- file(action="export_resources", outputPath=...)

Flow: State "I will do X. Proceed?" and only call the tool after the user explicitly agrees.

Additional rule:
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
`;


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
    ];
}

function asCategory(name: string): ToolCategory | null {
    return TOOL_CATEGORIES.includes(name as ToolCategory) ? (name as ToolCategory) : null;
}

async function initSiYuanClient(): Promise<SiYuanClient> {
    const client = new SiYuanClient();

    try {
        const token = await client.request<string>('/api/system/getApiToken', {});
        if (token) {
            client.setToken(token);
        }
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const ignorable = e instanceof SyntaxError
            || /Unexpected end of JSON input/i.test(message)
            || /JSON/i.test(message);
        if (!ignorable) {
            console.error('[MCP] Failed to get API token:', message);
        }
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

        switch (category) {
            case 'notebook': return callNotebookTool(client, args, config.notebook, permMgr);
            case 'document': return callDocumentTool(client, args, config.document, permMgr);
            case 'block': return callBlockTool(client, args, config.block, permMgr);
            case 'file': return callFileTool(client, args, config.file, permMgr);
            case 'search': return callSearchTool(client, args, config.search, permMgr);
            case 'tag': return callTagTool(client, args, config.tag, permMgr);
            case 'system': return callSystemTool(client, args, config.system, permMgr);
        }
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

main().catch((error) => {
    console.error('[MCP] Failed to start server:', error instanceof Error ? error.message : String(error));
    process.exit(1);
});
