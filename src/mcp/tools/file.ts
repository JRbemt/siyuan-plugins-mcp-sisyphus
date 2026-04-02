import type { SiYuanClient } from '../../api/client';
import * as fileApi from '../../api/file';
import type { CategoryToolConfig, FileAction } from '../config';
import { FILE_ACTION_HINTS, FILE_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    FileActionSchema,
    FileExportMdSchema,
    FileExportResourcesSchema,
    FileRenderSprigSchema,
    FileRenderTemplateSchema,
    FileUploadAssetSchema,
} from '../types';
import { ensurePermissionForDocumentId } from './context';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, type ActionVariant, type ToolResult } from './shared';

export const FILE_TOOL_NAME = 'file';

export const FILE_VARIANTS: ActionVariant<FileAction>[] = [
    {
        action: 'upload_asset',
        schema: createActionSchema('upload_asset', {
            assetsDirPath: { type: 'string', description: 'Asset directory path (e.g., /assets/)' },
            file: { type: 'string', description: 'Base64 encoded file content' },
            fileName: { type: 'string', description: 'Original file name' },
        }, ['assetsDirPath', 'file', 'fileName'], 'Upload a file asset to the specified assets directory.'),
    },
    {
        action: 'render_template',
        schema: createActionSchema('render_template', {
            id: { type: 'string', description: 'Document ID for template context' },
            path: { type: 'string', description: 'Template file absolute path' },
        }, ['id', 'path'], 'Render a template with document context.'),
    },
    {
        action: 'render_sprig',
        schema: createActionSchema('render_sprig', {
            template: { type: 'string', description: 'Sprig template content' },
        }, ['template'], 'Render a Sprig template.'),
    },
    {
        action: 'export_md',
        schema: createActionSchema('export_md', {
            id: { type: 'string', description: 'Document ID to export' },
        }, ['id'], 'Export document content as Markdown.'),
    },
    {
        action: 'export_resources',
        schema: createActionSchema('export_resources', {
            paths: { type: 'array', items: { type: 'string' }, description: 'Paths to export' },
            name: { type: 'string', description: 'Export file name' },
        }, ['paths'], 'Export resources as a ZIP archive.'),
    },
];

export function listFileTools(config: CategoryToolConfig<FileAction>) {
    return buildAggregatedTool(
        FILE_TOOL_NAME,
        '📁 Grouped file and asset operations.',
        config,
        FILE_VARIANTS,
        {
            guidance: FILE_GUIDANCE,
            actionHints: FILE_ACTION_HINTS,
        },
    );
}

export async function callFileTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<FileAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    try {
        const parsedAction = FileActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(FILE_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'upload_asset': {
                const parsed = FileUploadAssetSchema.parse(rawArgs);
                const byteCharacters = atob(parsed.file);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const file = new File([byteArray], parsed.fileName);
                const result = await fileApi.uploadAsset(client, parsed.assetsDirPath, file, parsed.fileName);
                return createJsonResult(result);
            }
            case 'render_template': {
                const parsed = FileRenderTemplateSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) return denied;
                const result = await fileApi.renderTemplate(client, parsed.id, parsed.path);
                return createJsonResult(result);
            }
            case 'render_sprig': {
                const parsed = FileRenderSprigSchema.parse(rawArgs);
                const result = await fileApi.renderSprig(client, parsed.template);
                return createJsonResult(result);
            }
            case 'export_md': {
                const parsed = FileExportMdSchema.parse(rawArgs);
                const { denied } = await ensurePermissionForDocumentId(client, permMgr, parsed.id, 'read');
                if (denied) return denied;
                const result = await fileApi.exportMdContent(client, parsed.id);
                return createJsonResult(result);
            }
            case 'export_resources': {
                const parsed = FileExportResourcesSchema.parse(rawArgs);
                const result = await fileApi.exportResources(client, parsed.paths, parsed.name);
                return createJsonResult(result);
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: FILE_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: FILE_TOOL_NAME, action, rawArgs });
    }
}
