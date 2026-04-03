import type { SiYuanClient } from '../../api/client';
import * as blockApi from '../../api/block';
import * as documentApi from '../../api/document';
import * as notebookApi from '../../api/notebook';
import type { PermissionManager } from '../permissions';
import { createPermissionDeniedResult, type ToolResult } from './shared';

export interface ResolvedDocumentContext {
    documentId: string;
    notebook: string;
    path: string;
    hPath?: string;
    name?: string;
}

export interface ChildDocumentSummary {
    id: string;
    notebook: string;
    path: string;
    hPath?: string;
    name?: string;
    icon?: string;
    subFileCount?: number;
}

type PermissionRequirement = 'read' | 'write' | 'delete';

function normalizePath(value: string): string {
    return value.startsWith('/') ? value : `/${value}`;
}

function extractDocumentId(pathValue: string): string {
    const segment = normalizePath(pathValue).split('/').filter(Boolean).at(-1) ?? '';
    return segment.endsWith('.sy') ? segment.slice(0, -3) : segment;
}

export async function resolveDocumentContextById(client: SiYuanClient, id: string): Promise<ResolvedDocumentContext> {
    const docInfo = await blockApi.getDocInfo(client, id);
    const rootDocumentId = docInfo.rootID || docInfo.id;
    const pathInfo = await documentApi.getPathByID(client, rootDocumentId);
    return {
        documentId: rootDocumentId,
        notebook: pathInfo.notebook,
        path: normalizePath(pathInfo.path),
        name: docInfo.name,
    };
}

async function checkPermissionForDocumentContext(
    permMgr: PermissionManager,
    context: ResolvedDocumentContext,
    required: PermissionRequirement,
): Promise<ToolResult | null> {
    await permMgr.reload();
    const allowed = required === 'delete'
        ? permMgr.canDelete(context.notebook)
        : required === 'write'
            ? permMgr.canWrite(context.notebook)
            : permMgr.canRead(context.notebook);
    if (!allowed) {
        return createPermissionDeniedResult(context.notebook, permMgr.get(context.notebook), required);
    }
    return null;
}

export async function ensurePermissionForDocumentId(
    client: SiYuanClient,
    permMgr: PermissionManager,
    id: string,
    required: PermissionRequirement,
): Promise<{ context: ResolvedDocumentContext; denied: ToolResult | null }> {
    const context = await resolveDocumentContextById(client, id);
    const denied = await checkPermissionForDocumentContext(permMgr, context, required);
    return { context, denied };
}

export async function ensurePermissionForNotebook(
    permMgr: PermissionManager,
    notebookId: string,
    required: PermissionRequirement,
): Promise<ToolResult | null> {
    await permMgr.reload();
    const allowed = required === 'delete'
        ? permMgr.canDelete(notebookId)
        : required === 'write'
            ? permMgr.canWrite(notebookId)
            : permMgr.canRead(notebookId);
    if (!allowed) {
        return createPermissionDeniedResult(notebookId, permMgr.get(notebookId), required);
    }
    return null;
}

export async function resolveMoveTargetNotebook(client: SiYuanClient, toID: string): Promise<string> {
    const notebooks = await notebookApi.listNotebooks(client);
    const notebook = notebooks.notebooks.find((item) => item.id === toID);
    if (notebook) {
        return notebook.id;
    }
    const context = await resolveDocumentContextById(client, toID);
    return context.notebook;
}

export async function resolveNotebookForPath(client: SiYuanClient, pathValue: string): Promise<string | null> {
    const notebooks = await notebookApi.listNotebooks(client);
    for (const notebook of notebooks.notebooks) {
        try {
            await documentApi.getHPathByPath(client, notebook.id, pathValue);
            return notebook.id;
        } catch {
            continue;
        }
    }
    return null;
}

export async function listChildDocumentsByPath(
    client: SiYuanClient,
    notebook: string,
    pathValue: string,
): Promise<ChildDocumentSummary[]> {
    const response = await documentApi.listDocsByPath(client, notebook, pathValue);
    return response.files.map((child) => ({
        id: typeof child.id === 'string' && child.id.length > 0 ? child.id : extractDocumentId(child.path),
        notebook: child.box || response.box || notebook,
        path: normalizePath(child.path),
        hPath: child.hPath,
        name: child.name,
        icon: child.icon,
        subFileCount: child.subFileCount ?? child.count,
    }));
}
