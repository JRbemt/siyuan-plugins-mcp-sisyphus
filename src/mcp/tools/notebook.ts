import type { SiYuanClient } from '../../api/client';
import * as notebookApi from '../../api/notebook';
import type { CategoryToolConfig, NotebookAction } from '../config';
import { NOTEBOOK_ACTION_HINTS, NOTEBOOK_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    NotebookActionSchema,
    NotebookCloseSchema,
    NotebookCreateSchema,
    NotebookGetConfSchema,
    NotebookGetChildDocsSchema,
    NotebookGetPermissionsSchema,
    NotebookListSchema,
    NotebookOpenSchema,
    NotebookRemoveSchema,
    NotebookRenameSchema,
    NotebookSetConfSchema,
    NotebookSetIconSchema,
    NotebookSetPermissionSchema,
} from '../types';
import { ensurePermissionForNotebook, listChildDocumentsByPath } from './context';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, type ActionVariant, type ToolResult } from './shared';

export const NOTEBOOK_TOOL_NAME = 'notebook';

export const NOTEBOOK_VARIANTS: ActionVariant<NotebookAction>[] = [
    {
        action: 'list',
        schema: createActionSchema('list', {}, [], 'List all notebooks in the workspace.'),
    },
    {
        action: 'create',
        schema: createActionSchema('create', {
            name: { type: 'string', description: 'Notebook name' },
            icon: { type: 'string', description: 'Optional icon for the notebook, e.g., "1f4d4" for 📔' },
        }, ['name'], 'Create a new notebook.'),
    },
    {
        action: 'open',
        schema: createActionSchema('open', {
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['notebook'], 'Open a notebook.'),
    },
    {
        action: 'close',
        schema: createActionSchema('close', {
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['notebook'], 'Close a notebook.'),
    },
    {
        action: 'remove',
        schema: createActionSchema('remove', {
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['notebook'], 'Remove a notebook.'),
    },
    {
        action: 'rename',
        schema: createActionSchema('rename', {
            notebook: { type: 'string', description: 'Notebook ID' },
            name: { type: 'string', description: 'New notebook name' },
        }, ['notebook', 'name'], 'Rename a notebook.'),
    },
    {
        action: 'get_conf',
        schema: createActionSchema('get_conf', {
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['notebook'], 'Get notebook configuration.'),
    },
    {
        action: 'set_conf',
        schema: createActionSchema('set_conf', {
            notebook: { type: 'string', description: 'Notebook ID' },
            conf: {
                type: 'object',
                description: 'Notebook configuration',
                properties: {
                    name: { type: 'string' },
                    closed: { type: 'boolean' },
                    refCreateSavePath: { type: 'string' },
                    createDocNameTemplate: { type: 'string' },
                    dailyNoteSavePath: { type: 'string' },
                    dailyNoteTemplatePath: { type: 'string' },
                },
            },
        }, ['notebook', 'conf'], 'Set notebook configuration.'),
    },
    {
        action: 'set_icon',
        schema: createActionSchema('set_icon', {
            notebook: { type: 'string', description: 'Notebook ID' },
            icon: { type: 'string', description: 'Icon value, e.g., "1f4d4" for 📔 or custom icon path' },
        }, ['notebook', 'icon'], 'Set the icon for a notebook.'),
    },
    {
        action: 'get_permissions',
        schema: createActionSchema('get_permissions', {}, [], 'Get permission levels for all notebooks. Returns each notebook with its permission: "none" (no access), "r" (read only), "rw" (read/write without delete), or "rwd" (read/write/delete, default).'),
    },
    {
        action: 'set_permission',
        schema: createActionSchema('set_permission', {
            notebook: { type: 'string', description: 'Notebook ID' },
            permission: {
                type: 'string',
                enum: ['none', 'r', 'rw', 'rwd'],
                description: 'Permission level: "none" blocks all access, "r" allows read only, "rw" allows read/write without delete, "rwd" allows read/write/delete (default)',
            },
        }, ['notebook', 'permission'], 'Set the permission level for a notebook.'),
    },
    {
        action: 'get_child_docs',
        schema: createActionSchema('get_child_docs', {
            notebook: { type: 'string', description: 'Notebook ID' },
        }, ['notebook'], 'Get direct child documents at the notebook root.'),
    },
];

export function listNotebookTools(config: CategoryToolConfig<NotebookAction>) {
    return buildAggregatedTool(
        NOTEBOOK_TOOL_NAME,
        '📚 Grouped notebook operations.',
        config,
        NOTEBOOK_VARIANTS,
        {
            guidance: NOTEBOOK_GUIDANCE,
            actionHints: NOTEBOOK_ACTION_HINTS,
        },
    );
}

function normalizeNotebookChildDocsError(error: unknown, notebookId: string, exists: boolean, closed: boolean): Error {
    const message = error instanceof Error ? error.message : String(error);

    if (!exists) {
        return new Error(`Failed to get child documents: notebook "${notebookId}" does not exist.`);
    }

    if (message.includes('permission')) {
        return new Error(`Failed to get child documents for notebook "${notebookId}": permission denied by SiYuan. ${message}`);
    }

    if (closed) {
        return new Error(`Failed to get child documents for notebook "${notebookId}": notebook is currently closed or still initializing. ${message}`);
    }

    return new Error(`Failed to get child documents for notebook "${notebookId}" at "/". ${message}`);
}

export async function callNotebookTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<NotebookAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    try {
        const parsedAction = NotebookActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(NOTEBOOK_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'list': {
                NotebookListSchema.parse(rawArgs);
                const result = await notebookApi.listNotebooks(client);
                return createJsonResult(result.notebooks);
            }
            case 'create': {
                const parsed = NotebookCreateSchema.parse(rawArgs);
                const result = await notebookApi.createNotebook(client, parsed.name);
                if (parsed.icon) {
                    await notebookApi.setNotebookIcon(client, result.notebook.id, parsed.icon);
                    result.notebook.icon = parsed.icon;
                }
                return createJsonResult(result.notebook);
            }
            case 'open': {
                const parsed = NotebookOpenSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) return denied;
                await notebookApi.openNotebook(client, parsed.notebook);
                return createJsonResult({ success: true, notebook: parsed.notebook });
            }
            case 'close': {
                const parsed = NotebookCloseSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) return denied;
                await notebookApi.closeNotebook(client, parsed.notebook);
                return createJsonResult({ success: true, notebook: parsed.notebook });
            }
            case 'remove': {
                const parsed = NotebookRemoveSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'delete');
                if (denied) return denied;
                await notebookApi.removeNotebook(client, parsed.notebook);
                return createJsonResult({ success: true, notebook: parsed.notebook });
            }
            case 'rename': {
                const parsed = NotebookRenameSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
                if (denied) return denied;
                await notebookApi.renameNotebook(client, parsed.notebook, parsed.name);
                return createJsonResult({ success: true, notebook: parsed.notebook, name: parsed.name });
            }
            case 'get_conf': {
                const parsed = NotebookGetConfSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) return denied;
                const result = await notebookApi.getNotebookConf(client, parsed.notebook);
                return createJsonResult(result);
            }
            case 'set_conf': {
                const parsed = NotebookSetConfSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
                if (denied) return denied;
                const result = await notebookApi.setNotebookConf(client, parsed.notebook, parsed.conf);
                return createJsonResult(result);
            }
            case 'set_icon': {
                const parsed = NotebookSetIconSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'write');
                if (denied) return denied;
                await notebookApi.setNotebookIcon(client, parsed.notebook, parsed.icon);
                return createJsonResult({ success: true, notebook: parsed.notebook, icon: parsed.icon });
            }
            case 'get_permissions': {
                NotebookGetPermissionsSchema.parse(rawArgs);
                await permMgr.reload();
                const listResult = await notebookApi.listNotebooks(client);
                const notebooks = listResult.notebooks.map(nb => ({
                    id: nb.id,
                    name: nb.name,
                    permission: permMgr.get(nb.id),
                }));
                return createJsonResult({ notebooks });
            }
            case 'set_permission': {
                const parsed = NotebookSetPermissionSchema.parse(rawArgs);
                await permMgr.set(parsed.notebook, parsed.permission);
                return createJsonResult({ success: true, notebook: parsed.notebook, permission: parsed.permission });
            }
            case 'get_child_docs': {
                const parsed = NotebookGetChildDocsSchema.parse(rawArgs);
                const denied = await ensurePermissionForNotebook(permMgr, parsed.notebook, 'read');
                if (denied) {
                    return denied;
                }
                const notebookList = await notebookApi.listNotebooks(client);
                const notebook = notebookList.notebooks.find((item) => item.id === parsed.notebook);

                if (!notebook) {
                    throw normalizeNotebookChildDocsError(new Error('Notebook not found in lsNotebooks result.'), parsed.notebook, false, false);
                }

                let children;
                try {
                    children = await listChildDocumentsByPath(client, parsed.notebook, '/');
                } catch (error) {
                    throw normalizeNotebookChildDocsError(error, parsed.notebook, true, Boolean(notebook.closed));
                }
                return createJsonResult(children);
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: NOTEBOOK_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: NOTEBOOK_TOOL_NAME, action, rawArgs });
    }
}
