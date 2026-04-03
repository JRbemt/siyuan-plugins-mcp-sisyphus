import type { SiYuanClient } from '../../api/client';
import * as attributeApi from '../../api/attribute';
import * as blockApi from '../../api/block';
import * as documentApi from '../../api/document';
import * as fileApi from '../../api/file';
import type { CategoryToolConfig, DocumentAction } from '../config';
import { DOCUMENT_ACTION_HINTS, DOCUMENT_GUIDANCE } from '../help';
import { normalizeMarkdownContent } from '../normalize';
import type { PermissionManager } from '../permissions';
import {
    DocumentActionSchema,
    DocumentCreateSchema,
    DocumentCreateDailyNoteSchema,
    DocumentGetChildBlocksSchema,
    DocumentGetChildDocsSchema,
    DocumentGetDocSchema,
    DocumentGetHPathSchema,
    DocumentGetIdsSchema,
    DocumentListTreeSchema,
    DocumentGetPathSchema,
    DocumentMoveSchema,
    DocumentRemoveSchema,
    DocumentRenameSchema,
    DocumentSearchDocsSchema,
    DocumentSetIconSchema,
} from '../types';
import {
    ensurePermissionForDocumentId,
    ensurePermissionForNotebook,
    listChildDocumentsByPath,
    resolveMoveTargetNotebook,
    resolveNotebookForPath,
} from './context';
import { filterBacklinkResultByPermission, filterItemsByPermissionAndPath } from './search';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, createPermissionDeniedResult, createSetIconReminder, tryHandleHelpAction, type ActionVariant, type ToolResult } from './shared';

export const DOCUMENT_TOOL_NAME = 'document';

export const DOCUMENT_VARIANTS: ActionVariant<DocumentAction>[] = [
    {
        action: 'create',
        schema: createActionSchema('create', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Human-readable target path, must start with / (e.g., /foo/bar). Parent paths must already exist.' },
            markdown: { type: 'string', description: 'Markdown content' },
            icon: { type: 'string', description: 'Optional document icon. Prefer a Unicode hex code string such as "1f4d4" for 📔 instead of a raw emoji character.' },
        }, ['notebook', 'path', 'markdown'], 'Create a new document with markdown content.'),
    },
    {
        action: 'rename',
        schema: createActionSchema('rename', {
            id: { type: 'string', description: 'Document ID' },
            title: { type: 'string', description: 'New document title' },
        }, ['id', 'title'], 'Rename a document by document ID.'),
    },
    {
        action: 'rename',
        schema: createActionSchema('rename', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path' },
            title: { type: 'string', description: 'New document title' },
        }, ['notebook', 'path', 'title'], 'Rename a document by storage path.'),
    },
    {
        action: 'remove',
        schema: createActionSchema('remove', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Remove a document by document ID.'),
    },
    {
        action: 'remove',
        schema: createActionSchema('remove', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path' },
        }, ['notebook', 'path'], 'Remove a document by storage path.'),
    },
    {
        action: 'move',
        schema: createActionSchema('move', {
            fromPaths: { type: 'array', items: { type: 'string' }, description: 'Source document paths' },
            toNotebook: { type: 'string', description: 'Target notebook ID' },
            toPath: { type: 'string', description: 'Target storage path' },
        }, ['fromPaths', 'toNotebook', 'toPath'], 'Move multiple documents by storage path.'),
    },
    {
        action: 'move',
        schema: createActionSchema('move', {
            fromIDs: { type: 'array', items: { type: 'string' }, description: 'Source document IDs' },
            toID: { type: 'string', description: 'Target document ID or notebook ID' },
        }, ['fromIDs', 'toID'], 'Move multiple documents by document ID.'),
    },
    {
        action: 'get_path',
        schema: createActionSchema('get_path', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get storage path by document ID.'),
    },
    {
        action: 'get_hpath',
        schema: createActionSchema('get_hpath', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get hierarchical path by document ID.'),
    },
    {
        action: 'get_hpath',
        schema: createActionSchema('get_hpath', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path' },
        }, ['notebook', 'path'], 'Get hierarchical path by storage path.'),
    },
    {
        action: 'get_ids',
        schema: createActionSchema('get_ids', {
            path: { type: 'string', description: 'Human-readable path (e.g., /foo/bar)' },
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['path', 'notebook'], 'Get document IDs by hierarchical path.'),
    },
    {
        action: 'get_child_blocks',
        schema: createActionSchema('get_child_blocks', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get direct child blocks for a document ID.'),
    },
    {
        action: 'get_child_docs',
        schema: createActionSchema('get_child_docs', {
            id: { type: 'string', description: 'Document ID' },
        }, ['id'], 'Get direct child documents for a document ID.'),
    },
    {
        action: 'set_icon',
        schema: createActionSchema('set_icon', {
            id: { type: 'string', description: 'Document ID' },
            icon: { type: 'string', description: 'Icon value. Prefer a Unicode hex code string such as "1f4d4" for 📔; raw emoji characters may not render correctly. Custom icon paths are also supported.' },
        }, ['id', 'icon'], 'Set the icon for a document or folder.'),
    },
    {
        action: 'list_tree',
        schema: createActionSchema('list_tree', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Storage path or / for the notebook root' },
            maxDepth: { type: 'number', description: 'Max tree depth (default 3). Deeper nodes collapsed to childCount.' },
        }, ['notebook', 'path'], 'List the document tree under a notebook path.'),
    },
    {
        action: 'search_docs',
        schema: createActionSchema('search_docs', {
            notebook: { type: 'string', description: 'Notebook ID used for permission scoping' },
            query: { type: 'string', description: 'Keyword to search in document titles' },
            path: { type: 'string', description: 'Optional storage path to narrow the search scope' },
        }, ['notebook', 'query'], 'Search documents by title keyword.'),
    },
    {
        action: 'get_doc',
        schema: createActionSchema('get_doc', {
            id: { type: 'string', description: 'Document ID' },
            mode: { type: 'string', enum: ['markdown', 'html'], description: 'Return mode: markdown (default) or html' },
            size: { type: 'number', description: 'Optional maximum content size hint' },
            page: { type: 'number', description: 'Page number for markdown pagination (1-based)' },
            pageSize: { type: 'number', description: 'Characters per page for markdown pagination (default 8000)' },
        }, ['id'], 'Get document content and metadata with markdown pagination support.'),
    },
    {
        action: 'create_daily_note',
        schema: createActionSchema('create_daily_note', {
            notebook: { type: 'string', description: 'Notebook ID' },
            app: { type: 'string', description: 'Optional app identifier passed through to SiYuan' },
        }, ['notebook'], 'Create or return today’s daily note.'),
    },
];

export function listDocumentTools(config: CategoryToolConfig<DocumentAction>) {
    return buildAggregatedTool(
        DOCUMENT_TOOL_NAME,
        '📝 Grouped document operations.',
        config,
        DOCUMENT_VARIANTS,
        {
            guidance: DOCUMENT_GUIDANCE,
            actionHints: DOCUMENT_ACTION_HINTS,
            propertyDescriptionOverrides: {
                path: 'Path value. For action="create", use a human-readable target path such as /Inbox/Weekly Note. For other document actions that use notebook + path, use a storage path returned by document(action="get_path").',
                fromPaths: 'Source storage paths returned by document(action="get_path").',
                toPath: 'Target storage path. Use the storage path of an existing destination document returned by document(action="get_path").',
            },
        },
    );
}

function truncateTreeByDepth(nodes: unknown, maxDepth: number, currentDepth = 0): unknown {
    if (!Array.isArray(nodes)) return nodes;
    return nodes.map((node) => {
        if (!node || typeof node !== 'object') return node;
        const typedNode = node as Record<string, unknown>;
        if (currentDepth >= maxDepth && Array.isArray(typedNode.children) && typedNode.children.length > 0) {
            const { children, ...rest } = typedNode;
            return { ...rest, childCount: (children as unknown[]).length, childrenTruncated: true };
        }
        if (Array.isArray(typedNode.children)) {
            return { ...typedNode, children: truncateTreeByDepth(typedNode.children, maxDepth, currentDepth + 1) };
        }
        return typedNode;
    });
}

async function enrichTreeNodesWithDocInfo(
    client: SiYuanClient,
    value: unknown,
    cache = new Map<string, Promise<Awaited<ReturnType<typeof blockApi.getDocInfo>>>>(),
): Promise<unknown> {
    if (!Array.isArray(value)) return value;

    return Promise.all(value.map(async (node) => {
        if (!node || typeof node !== 'object') return node;
        const typedNode = node as Record<string, unknown>;
        const enrichedNode: Record<string, unknown> = { ...typedNode };
        const id = typeof typedNode.id === 'string' ? typedNode.id : undefined;

        if (id && (typedNode.name === undefined || typedNode.icon === undefined)) {
            try {
                let pending = cache.get(id);
                if (!pending) {
                    pending = blockApi.getDocInfo(client, id);
                    cache.set(id, pending);
                }
                const info = await pending;
                if (enrichedNode.name === undefined && info.name) {
                    enrichedNode.name = info.name.replace(/\.sy$/, '');
                }
                if (enrichedNode.icon === undefined && info.icon) {
                    enrichedNode.icon = info.icon;
                }
            } catch {
                // Ignore enrichment failures and keep the original node.
            }
        }

        if (Array.isArray(typedNode.children)) {
            enrichedNode.children = await enrichTreeNodesWithDocInfo(client, typedNode.children, cache);
        }

        return enrichedNode;
    }));
}

function filterSearchDocsResultByPermission(result: unknown, permMgr: PermissionManager): unknown {
    if (Array.isArray(result)) {
        return filterBacklinkResultByPermission({ backmentions: result }, permMgr).backmentions;
    }

    if (!result || typeof result !== 'object') return result;
    const typedResult = result as Record<string, unknown>;

    if (Array.isArray(typedResult.files)) {
        return {
            ...typedResult,
            files: filterBacklinkResultByPermission({ backmentions: typedResult.files }, permMgr).backmentions,
        };
    }

    if (Array.isArray(typedResult.docs)) {
        return {
            ...typedResult,
            docs: filterBacklinkResultByPermission({ backmentions: typedResult.docs }, permMgr).backmentions,
        };
    }

    return result;
}

async function filterSearchDocsResult(
    client: SiYuanClient,
    result: unknown,
    permMgr: PermissionManager,
    scopePath?: string,
): Promise<{
    data: unknown;
    permissionFilteredOutCount: number;
    pathFilteredOutCount: number;
}> {
    if (Array.isArray(result)) {
        const filtered = await filterItemsByPermissionAndPath(client, result, permMgr, scopePath);
        return {
            data: filtered.items,
            permissionFilteredOutCount: filtered.permissionFilteredOutCount,
            pathFilteredOutCount: filtered.pathFilteredOutCount,
        };
    }

    if (!result || typeof result !== 'object') {
        return {
            data: result,
            permissionFilteredOutCount: 0,
            pathFilteredOutCount: 0,
        };
    }

    const typedResult = result as Record<string, unknown>;

    if (Array.isArray(typedResult.files)) {
        const filtered = await filterItemsByPermissionAndPath(client, typedResult.files, permMgr, scopePath);
        return {
            data: {
                ...typedResult,
                files: filtered.items,
            },
            permissionFilteredOutCount: filtered.permissionFilteredOutCount,
            pathFilteredOutCount: filtered.pathFilteredOutCount,
        };
    }

    if (Array.isArray(typedResult.docs)) {
        const filtered = await filterItemsByPermissionAndPath(client, typedResult.docs, permMgr, scopePath);
        return {
            data: {
                ...typedResult,
                docs: filtered.items,
            },
            permissionFilteredOutCount: filtered.permissionFilteredOutCount,
            pathFilteredOutCount: filtered.pathFilteredOutCount,
        };
    }

    return {
        data: filterSearchDocsResultByPermission(result, permMgr),
        permissionFilteredOutCount: 0,
        pathFilteredOutCount: 0,
    };
}

export async function callDocumentTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<DocumentAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(DOCUMENT_TOOL_NAME, rawArgs, config, DOCUMENT_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const parsedAction = DocumentActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(DOCUMENT_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'create': {
                const parsed = DocumentCreateSchema.parse(rawArgs);
                await permMgr.reload();
                if (!permMgr.canWrite(parsed.notebook)) {
                    return createPermissionDeniedResult(parsed.notebook, permMgr.get(parsed.notebook), 'write');
                }
                const docId = await documentApi.createDoc(client, parsed.notebook, parsed.path, parsed.markdown);
                if (parsed.icon) {
                    await attributeApi.setBlockAttrs(client, docId, { icon: parsed.icon });
                }
                return createJsonResult({
                    success: true,
                    notebook: parsed.notebook,
                    path: parsed.path,
                    id: docId,
                    iconHint: createSetIconReminder('document', Boolean(parsed.icon)),
                });
            }
            case 'rename': {
                const parsed = DocumentRenameSchema.parse(rawArgs);
                if (parsed.id) {
                    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
                    if (denied) {
                        return denied;
                    }
                    await documentApi.renameDocByID(client, parsed.id, parsed.title);
                    return createJsonResult({ success: true, id: parsed.id, title: parsed.title });
                }
                if (parsed.notebook) {
                    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
                    if (denied) {
                        return denied;
                    }
                }
                await documentApi.renameDoc(client, parsed.notebook!, parsed.path!, parsed.title);
                return createJsonResult({ success: true, notebook: parsed.notebook, path: parsed.path, title: parsed.title });
            }
            case 'remove': {
                const parsed = DocumentRemoveSchema.parse(rawArgs);
                if (parsed.id) {
                    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'delete');
                    if (denied) {
                        return denied;
                    }
                    await documentApi.removeDocByID(client, parsed.id);
                    return createJsonResult({ success: true, id: parsed.id });
                }
                if (parsed.notebook) {
                    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'delete');
                    if (denied) {
                        return denied;
                    }
                }
                await documentApi.removeDoc(client, parsed.notebook!, parsed.path!);
                return createJsonResult({ success: true, notebook: parsed.notebook, path: parsed.path });
            }
            case 'move': {
                const parsed = DocumentMoveSchema.parse(rawArgs);
                if (parsed.toNotebook) {
                    const denied = await ensurePermissionForNotebook(permMgr, parsed.toNotebook, 'write');
                    if (denied) {
                        return denied;
                    }
                }
                if (parsed.toID) {
                    const targetNotebook = await resolveMoveTargetNotebook(client, parsed.toID);
                    const denied = await ensurePermissionForNotebook(permMgr, targetNotebook, 'write');
                    if (denied) {
                        return denied;
                    }
                }
                if (parsed.fromIDs) {
                    for (const id of parsed.fromIDs) {
                        const { denied } = await ensurePermissionForDocumentId(client, permMgr, id, 'write');
                        if (denied) {
                            return denied;
                        }
                    }
                    await documentApi.moveDocsByID(client, parsed.fromIDs, parsed.toID!);
                    return createJsonResult({ success: true, fromIDs: parsed.fromIDs, toID: parsed.toID });
                }
                for (const sourcePath of parsed.fromPaths!) {
                    const sourceNotebook = await resolveNotebookForPath(client, sourcePath);
                    if (!sourceNotebook) {
                        throw new Error(`Unable to resolve source notebook for storage path "${sourcePath}" while checking permissions.`);
                    }
                    const denied = await ensurePermissionForNotebook(permMgr, sourceNotebook, 'write');
                    if (denied) {
                        return denied;
                    }
                }
                await documentApi.moveDocs(client, parsed.fromPaths!, parsed.toNotebook!, parsed.toPath!);
                return createJsonResult({ success: true, fromPaths: parsed.fromPaths, toNotebook: parsed.toNotebook, toPath: parsed.toPath });
            }
            case 'get_path': {
                const parsed = DocumentGetPathSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const result = await documentApi.getPathByID(client, parsed.id);
                return createJsonResult(result);
            }
            case 'get_hpath': {
                const parsed = DocumentGetHPathSchema.parse(rawArgs);
                if (parsed.notebook) {
                    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                    if (denied) {
                        return denied;
                    }
                }
                if (parsed.id) {
                    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                    if (denied) {
                        return denied;
                    }
                    const result = await documentApi.getHPathByID(client, parsed.id);
                    return createJsonResult(result);
                }
                const result = await documentApi.getHPathByPath(client, parsed.notebook!, parsed.path!);
                return createJsonResult(result);
            }
            case 'get_ids': {
                const parsed = DocumentGetIdsSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) {
                    return denied;
                }
                const result = await documentApi.getIDsByHPath(client, parsed.path, parsed.notebook);
                return createJsonResult(result);
            }
            case 'get_child_blocks': {
                const parsed = DocumentGetChildBlocksSchema.parse(rawArgs);
                const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const result = await blockApi.getChildBlocks(client, context.documentId);
                return createJsonResult(result);
            }
            case 'get_child_docs': {
                const parsed = DocumentGetChildDocsSchema.parse(rawArgs);
                const { denied, context } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const result = await listChildDocumentsByPath(client, context.notebook, context.path);
                return createJsonResult(result);
            }
            case 'set_icon': {
                const parsed = DocumentSetIconSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
                if (denied) {
                    return denied;
                }
                await attributeApi.setBlockAttrs(client, parsed.id, { icon: parsed.icon });
                return createJsonResult({ success: true, id: parsed.id, icon: parsed.icon });
            }
            case 'list_tree': {
                const parsed = DocumentListTreeSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) {
                    return denied;
                }
                const maxDepth = parsed.maxDepth ?? 3;
                const result = await documentApi.listDocTree(client, parsed.notebook, parsed.path);
                if (result && typeof result === 'object' && Array.isArray((result as Record<string, unknown>).tree)) {
                    const enriched = await enrichTreeNodesWithDocInfo(client, (result as Record<string, unknown>).tree);
                    return createJsonResult({
                        ...(result as Record<string, unknown>),
                        tree: truncateTreeByDepth(enriched, maxDepth),
                        maxDepth,
                        depthHint: 'Use maxDepth to control tree depth. Use document(action="list_tree") with a deeper path to expand specific subtrees.',
                    });
                }
                const enriched = await enrichTreeNodesWithDocInfo(client, result);
                return createJsonResult({
                    tree: truncateTreeByDepth(enriched, maxDepth),
                    maxDepth,
                    depthHint: 'Use maxDepth to control tree depth. Use document(action="list_tree") with a deeper path to expand specific subtrees.',
                });
            }
            case 'search_docs': {
                const parsed = DocumentSearchDocsSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) {
                    return denied;
                }
                const result = await documentApi.searchDocs(client, parsed.query);
                const filtered = await filterSearchDocsResult(client, result, permMgr, parsed.path);
                const totalFilteredOutCount = filtered.permissionFilteredOutCount + filtered.pathFilteredOutCount;
                return createJsonResult({
                    ...((filtered.data && typeof filtered.data === 'object' && !Array.isArray(filtered.data))
                        ? filtered.data as Record<string, unknown>
                        : { docs: filtered.data }),
                    ...(parsed.path ? { path: parsed.path, pathApplied: true } : {}),
                    ...(filtered.permissionFilteredOutCount > 0 ? {
                        partial: true,
                        reason: 'permission_filtered',
                    } : {}),
                    ...(totalFilteredOutCount > 0 ? { filteredOutCount: totalFilteredOutCount } : {}),
                    ...(filtered.pathFilteredOutCount > 0 ? { pathFilteredOutCount: filtered.pathFilteredOutCount } : {}),
                });
            }
            case 'get_doc': {
                const parsed = DocumentGetDocSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) {
                    return denied;
                }
                const defaultPageSize = 8000;
                if (parsed.mode === 'html') {
                    const result = await documentApi.getDoc(client, parsed.id, 0, parsed.size);
                    return createJsonResult({ id: parsed.id, mode: 'html', ...((result && typeof result === 'object') ? result as Record<string, unknown> : { content: result }) });
                }
                const markdown = normalizeMarkdownContent(await fileApi.exportMdContent(client, parsed.id));
                const content = typeof markdown.content === 'string' ? markdown.content : '';
                const page = parsed.page ?? 1;
                const pageSize = parsed.pageSize ?? defaultPageSize;
                const pageCount = Math.max(1, Math.ceil(content.length / pageSize));
                const normalizedPage = Math.min(page, pageCount);
                const start = (normalizedPage - 1) * pageSize;
                const pagedContent = content.slice(start, start + pageSize);
                const isPaginated = content.length > pageSize;
                return createJsonResult({
                    id: parsed.id,
                    mode: 'markdown',
                    hPath: markdown.hPath,
                    content: pagedContent,
                    ...(isPaginated ? {
                        truncated: true,
                        contentLength: content.length,
                        showing: pagedContent.length,
                        page: normalizedPage,
                        pageSize,
                        pageCount,
                        hasNextPage: normalizedPage < pageCount,
                        hint: 'Use page/pageSize to read the next markdown chunk. For structured reads, use document(action="get_child_blocks") or block(action="get_kramdown").',
                    } : {}),
                });
            }
            case 'create_daily_note': {
                const parsed = DocumentCreateDailyNoteSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
                if (denied) {
                    return denied;
                }
                const result = await documentApi.createDailyNote(client, parsed.notebook, parsed.app);
                let hPath: string | undefined;
                try {
                    hPath = await documentApi.getHPathByID(client, result.id);
                } catch {
                    hPath = undefined;
                }
                return createJsonResult({
                    success: true,
                    notebook: parsed.notebook,
                    ...result,
                    ...(hPath ? { hPath } : {}),
                    iconHint: createSetIconReminder('document'),
                });
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: DOCUMENT_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: DOCUMENT_TOOL_NAME, action, rawArgs });
    }
}
