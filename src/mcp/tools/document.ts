import type { SiYuanClient } from '../../api/client';
import * as blockApi from '../../api/block';
import * as documentApi from '../../api/document';
import type { CategoryToolConfig, DocumentAction } from '../config';
import { DOCUMENT_ACTION_HINTS, DOCUMENT_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    DocumentActionSchema,
    DocumentCreateSchema,
    DocumentGetChildBlocksSchema,
    DocumentGetChildDocsSchema,
    DocumentGetHPathSchema,
    DocumentGetIdsSchema,
    DocumentGetPathSchema,
    DocumentMoveSchema,
    DocumentRemoveSchema,
    DocumentRenameSchema,
} from '../types';
import {
    ensurePermissionForDocumentId,
    ensurePermissionForNotebook,
    listChildDocumentsByPath,
    resolveMoveTargetNotebook,
    resolveNotebookForPath,
} from './context';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, createPermissionDeniedResult, type ActionVariant, type ToolResult } from './shared';

export const DOCUMENT_TOOL_NAME = 'document';

export const DOCUMENT_VARIANTS: ActionVariant<DocumentAction>[] = [
    {
        action: 'create',
        schema: createActionSchema('create', {
            notebook: { type: 'string', description: 'Notebook ID' },
            path: { type: 'string', description: 'Human-readable target path, must start with / (e.g., /foo/bar). Parent paths must already exist.' },
            markdown: { type: 'string', description: 'Markdown content' },
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
];

export function listDocumentTools(config: CategoryToolConfig<DocumentAction>) {
    return buildAggregatedTool(
        DOCUMENT_TOOL_NAME,
        'Grouped document operations.',
        config,
        DOCUMENT_VARIANTS,
        {
            guidance: DOCUMENT_GUIDANCE,
            actionHints: DOCUMENT_ACTION_HINTS,
            propertyDescriptionOverrides: {
                path: 'Path value. For action="create", use a human-readable target path such as /Inbox/Weekly Note. For other document actions that use notebook + path, use a storage path returned by document(action="get_path").',
                fromPaths: 'Source storage paths returned by document(action="get_path").',
                toPath: 'Target storage path. Use the destination document or folder storage path returned by document(action="get_path").',
            },
        },
    );
}

export async function callDocumentTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<DocumentAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

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
                return createJsonResult({ success: true, notebook: parsed.notebook, path: parsed.path, id: docId });
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
                    const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'write');
                    if (denied) {
                        return denied;
                    }
                    await documentApi.removeDocByID(client, parsed.id);
                    return createJsonResult({ success: true, id: parsed.id });
                }
                if (parsed.notebook) {
                    const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
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
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: DOCUMENT_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: DOCUMENT_TOOL_NAME, action, rawArgs });
    }
}
