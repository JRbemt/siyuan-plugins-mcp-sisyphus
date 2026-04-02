import { isDangerousAction, type ToolCategory } from './config';
import {
    ACTION_RESOURCE_TEMPLATE_URI,
    ACTIONS_BY_CATEGORY,
    DOCUMENT_PATH_RESOURCE_URI,
    EXAMPLES_RESOURCE_URI,
    TOOL_ACTION_HINTS,
    TOOL_GUIDANCE_BY_CATEGORY,
    TOOL_OVERVIEW_RESOURCE_URI,
    isKnownAction,
    isKnownToolCategory,
} from './help';
import { BLOCK_VARIANTS } from './tools/block';
import { DOCUMENT_VARIANTS } from './tools/document';
import { FILE_VARIANTS } from './tools/file';
import { NOTEBOOK_VARIANTS } from './tools/notebook';
import { SEARCH_VARIANTS } from './tools/search';
import { SYSTEM_VARIANTS } from './tools/system';
import { TAG_VARIANTS } from './tools/tag';
import { getSchemaProperties, getSchemaRequired, type ActionVariant, type JsonSchema } from './tools/shared';

interface HelpResourceDefinition {
    uri: string;
    name: string;
    title: string;
    description: string;
    mimeType: string;
    text: string;
}

const MIME_TYPE = 'text/markdown';

const VARIANTS_BY_CATEGORY: Record<ToolCategory, ActionVariant<string>[]> = {
    notebook: NOTEBOOK_VARIANTS,
    document: DOCUMENT_VARIANTS,
    block: BLOCK_VARIANTS,
    file: FILE_VARIANTS,
    search: SEARCH_VARIANTS,
    tag: TAG_VARIANTS,
    system: SYSTEM_VARIANTS,
};

function getSchemaRequiredWithoutAction(schema: JsonSchema): string[] {
    return getSchemaRequired(schema).filter(field => field !== 'action');
}

function formatJsonExample(value: unknown): string {
    return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function buildExampleValue(fieldName: string, schema: JsonSchema): unknown {
    const description = typeof schema.description === 'string' ? schema.description : '';
    const enumValues = Array.isArray(schema.enum) ? schema.enum : [];
    if (enumValues.length > 0) return enumValues[0];

    switch (fieldName) {
        case 'notebook':
            return '20210808180117-czj9bvb';
        case 'id':
        case 'parentID':
        case 'previousID':
        case 'nextID':
        case 'fromID':
        case 'toID':
            return '20240318112233-abc123';
        case 'fromIDs':
            return ['20240318112233-a', '20240318112233-b'];
        case 'fromPaths':
            return ['/20240318112233-a.sy', '/20240318112233-b.sy'];
        case 'toNotebook':
            return '20210808180117-czj9bvb';
        case 'toPath':
            return '/20240318112233-existing-parent.sy';
        case 'path':
            return description.includes('Human-readable')
                ? '/Inbox/Weekly Note'
                : '/20240318112233-abc123.sy';
        case 'paths':
            return ['/assets/example.png'];
        case 'title':
            return 'Weekly Notes';
        case 'name':
            return description.includes('Export file name') ? 'assets-export.zip' : 'Research';
        case 'markdown':
            return '# Weekly Notes\n\n- Seed item';
        case 'dataType':
            return 'markdown';
        case 'data':
            return '- New item';
        case 'template':
            return 'codex-{{ now | date "2006" }}';
        case 'msg':
            return 'Hello from MCP';
        case 'timeout':
            return 3000;
        case 'assetsDirPath':
            return '/assets/';
        case 'file':
            return 'SGVsbG8sIFNpWXVhbg==';
        case 'fileName':
            return 'hello.txt';
        case 'attrs':
            return { 'custom-mcp': 'demo' };
        case 'conf':
            return { closed: false };
        case 'query':
            return 'search keyword';
        case 'stmt':
            return "SELECT * FROM blocks WHERE content LIKE '%keyword%' LIMIT 20";
        case 'k':
            return 'todo';
        case 'keyword':
            return 'filter text';
        default:
            break;
    }

    if (schema.type === 'array') {
        const items = schema.items && typeof schema.items === 'object' ? schema.items as JsonSchema : { type: 'string' };
        return [buildExampleValue(`${fieldName}Item`, items)];
    }

    if (schema.type === 'object') {
        const properties = getSchemaProperties(schema);
        const firstProperty = Object.keys(properties)[0];
        if (!firstProperty) return {};
        return {
            [firstProperty]: buildExampleValue(firstProperty, properties[firstProperty]),
        };
    }

    if (schema.type === 'number') return 1;
    if (schema.type === 'boolean') return false;
    return `<${fieldName}>`;
}

function buildActionExamples(tool: ToolCategory, action: string): string[] {
    const variants = VARIANTS_BY_CATEGORY[tool].filter((variant) => variant.action === action);

    return variants.map((variant) => {
        const properties = getSchemaProperties(variant.schema);
        const example: Record<string, unknown> = { action };

        for (const field of getSchemaRequiredWithoutAction(variant.schema)) {
            example[field] = buildExampleValue(field, properties[field] ?? {});
        }

        return formatJsonExample(example);
    });
}

function buildShapeSummary(tool: ToolCategory, action: string): string[] {
    return VARIANTS_BY_CATEGORY[tool]
        .filter((variant) => variant.action === action)
        .map((variant) => {
            const fields = getSchemaRequiredWithoutAction(variant.schema);
            return fields.length > 0 ? `- \`${fields.join(' + ')}\`` : '- `action` only';
        });
}

function renderToolOverview(): string {
    const sections = (Object.keys(ACTIONS_BY_CATEGORY) as ToolCategory[]).map((tool) => {
        const actions = ACTIONS_BY_CATEGORY[tool].join(', ');
        const guidance = TOOL_GUIDANCE_BY_CATEGORY[tool].map((line) => `- ${line}`).join('\n');
        return `## \`${tool}\`\n\nEnabled action family: \`${actions}\`\n\n${guidance}`;
    }).join('\n\n');

    return [
        '# SiYuan MCP Tool Overview',
        '',
        'This server exposes 7 aggregated tools: `notebook`, `document`, `block`, `file`, `search`, `tag`, and `system`.',
        '',
        '## High-risk actions',
        '',
        '- `notebook(action="remove")`',
        '- `document(action="remove")`, `document(action="move")`',
        '- `block(action="delete")`, `block(action="move")`',
        '- `tag(action="remove")`',
        '',
        'Call these only after explicit user confirmation.',
        '',
        sections,
        '',
        '## More help',
        '',
        '- Tag creation: write tags into block markdown as `#标签#` so `tag(action="list")` can discover them.',
        '',
        `- Path semantics: \`${DOCUMENT_PATH_RESOURCE_URI}\``,
        `- Common examples: \`${EXAMPLES_RESOURCE_URI}\``,
        `- Per-action help template: \`${ACTION_RESOURCE_TEMPLATE_URI}\``,
    ].join('\n');
}

function renderDocumentPathSemantics(): string {
    return [
        '# Document Path Semantics',
        '',
        '## Human-readable path',
        '',
        '- Used by `document(action="create")` and `document(action="get_ids")`.',
        '- Example: `/Inbox/Weekly Note`',
        '',
        '## Storage path',
        '',
        '- Used by `document(action="rename")`, `document(action="remove")`, `document(action="move")`, and `document(action="get_hpath")` when you pass `notebook + path`.',
        '- Obtain it from `document(action="get_path")` first.',
        '- Example: `/20240318112233-abc123.sy`',
        '- For path-based `document(action="move")`, `toPath` must point to an existing destination document.',
        '',
        '## Safe calling order',
        '',
        '1. Call `document(action="get_path", id=...)`.',
        '2. Reuse the returned storage path for path-based `rename`, `remove`, `move`, or `get_hpath`.',
        '3. Do not pass a human-readable path into those path-based actions.',
        '',
        '## Common mistake',
        '',
        '- `document(action="create")` accepts `/Inbox/Weekly Note`.',
        '- `document(action="rename", notebook=..., path=...)` expects a storage path like `/20240318112233-abc123.sy`.',
        '- `document(action="move", fromPaths=..., toNotebook=..., toPath=...)` does not accept a non-existent `.sy` path or a plain directory-like path as the destination.',
    ].join('\n');
}

function renderExamples(): string {
    return [
        '# Common MCP Examples',
        '',
        '## Create a document',
        '',
        buildActionExamples('document', 'create')[0],
        '',
        '## Move documents by ID',
        '',
        buildActionExamples('document', 'move')[1] ?? buildActionExamples('document', 'move')[0],
        '',
        '## Append a block to a document',
        '',
        buildActionExamples('block', 'append')[0],
        '',
        '## Get the SiYuan version',
        '',
        buildActionExamples('system', 'get_version')[0],
        '',
        '## Create tags via block markdown',
        '',
        formatJsonExample({
            action: 'update',
            id: '20240318112233-abc123',
            dataType: 'markdown',
            data: '#假期# #回家# #放松#',
        }),
        '',
        '## Full-text search',
        '',
        buildActionExamples('search', 'fulltext')[0],
        '',
        '## SQL query',
        '',
        buildActionExamples('search', 'query_sql')[0],
    ].join('\n');
}

function renderActionHelp(tool: ToolCategory, action: string): string {
    const actionVariants = VARIANTS_BY_CATEGORY[tool].filter((variant) => variant.action === action);
    const firstDescription = actionVariants
        .map((variant) => typeof variant.schema.description === 'string' ? variant.schema.description : '')
        .find(Boolean);
    const hint = TOOL_ACTION_HINTS[tool]?.[action];
    const shapes = buildShapeSummary(tool, action).join('\n');
    const examples = buildActionExamples(tool, action).join('\n\n');
    const confirmationNote = isDangerousAction(tool, action)
        ? 'This action requires explicit user confirmation before execution.'
        : null;

    return [
        `# ${tool}(action="${action}")`,
        '',
        firstDescription || 'Grouped MCP action help.',
        '',
        '## Valid shapes',
        '',
        shapes,
        '',
        '## Guidance',
        '',
        ...(TOOL_GUIDANCE_BY_CATEGORY[tool].map((line) => `- ${line}`)),
        ...(hint ? [`- ${hint}`] : []),
        ...(confirmationNote ? [`- ${confirmationNote}`] : []),
        '',
        '## Minimal examples',
        '',
        examples,
    ].join('\n');
}

function buildStaticHelpResources(): HelpResourceDefinition[] {
    return [
        {
            uri: TOOL_OVERVIEW_RESOURCE_URI,
            name: 'tool-overview',
            title: 'SiYuan MCP Tool Overview',
            description: 'Overview of grouped tools, path semantics, and confirmation rules.',
            mimeType: MIME_TYPE,
            text: renderToolOverview(),
        },
        {
            uri: DOCUMENT_PATH_RESOURCE_URI,
            name: 'document-path-semantics',
            title: 'Document Path Semantics',
            description: 'Explains human-readable paths versus storage paths for document actions.',
            mimeType: MIME_TYPE,
            text: renderDocumentPathSemantics(),
        },
        {
            uri: EXAMPLES_RESOURCE_URI,
            name: 'examples',
            title: 'Common MCP Examples',
            description: 'Minimal example calls for common notebook, document, block, file, and search actions.',
            mimeType: MIME_TYPE,
            text: renderExamples(),
        },
    ];
}

let staticHelpCache: HelpResourceDefinition[] | undefined;
function getStaticHelpResources(): HelpResourceDefinition[] {
    return (staticHelpCache ??= buildStaticHelpResources());
}

export function listHelpResources() {
    return getStaticHelpResources().map(({ text: _text, ...resource }) => resource);
}

export function listHelpResourceTemplates() {
    return [{
        uriTemplate: ACTION_RESOURCE_TEMPLATE_URI,
        name: 'action-help',
        title: 'Per-action MCP Help',
        description: 'Returns valid shapes, guidance, and minimal examples for a specific tool action.',
        mimeType: MIME_TYPE,
    }];
}

export function readHelpResource(uri: string) {
    const staticResource = getStaticHelpResources().find((resource) => resource.uri === uri);
    if (staticResource) {
        return {
            uri: staticResource.uri,
            mimeType: staticResource.mimeType,
            text: staticResource.text,
        };
    }

    let parsed: URL;
    try {
        parsed = new URL(uri);
    } catch {
        return null;
    }

    if (parsed.protocol !== 'siyuan:' || parsed.hostname !== 'help') return null;

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (segments[0] !== 'action' || segments.length !== 3) return null;

    const tool = segments[1];
    const action = segments[2];
    if (!isKnownToolCategory(tool) || !isKnownAction(tool, action)) return null;

    return {
        uri,
        mimeType: MIME_TYPE,
        text: renderActionHelp(tool, action),
    };
}
