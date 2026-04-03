import type { SiYuanClient } from '../../api/client';
import fs from 'fs';
import path from 'path';
import * as fileApi from '../../api/file';
import { normalizeMarkdownContent } from '../normalize';
import type { CategoryToolConfig, FileAction, FileCategoryToolConfig } from '../config';
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
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, tryHandleHelpAction, type ActionVariant, type ToolResult } from './shared';

export const FILE_TOOL_NAME = 'file';
const DEFAULT_LARGE_UPLOAD_THRESHOLD_MB = 10;

export const FILE_VARIANTS: ActionVariant<FileAction>[] = [
    {
        action: 'upload_asset',
        schema: createActionSchema('upload_asset', {
            assetsDirPath: { type: 'string', description: 'Asset directory path (e.g., /assets/)' },
            localFilePath: { type: 'string', description: 'Local file path to read and upload into the assets directory' },
            confirmLargeFile: { type: 'boolean', description: 'Set to true only after the user explicitly confirms uploading a file larger than the configured safety threshold.' },
        }, ['assetsDirPath', 'localFilePath'], 'Read a local file and upload it to the specified assets directory.'),
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
            outputPath: { type: 'string', description: 'Optional local absolute or relative filesystem path to save the exported ZIP' },
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

function normalizeResourcePath(input: string): string {
    const trimmed = input.trim().replace(/\\/g, '/');
    if (!trimmed) {
        return '';
    }

    const withoutLeadingSlash = trimmed.replace(/^\/+/, '');
    const workspaceRelative = withoutLeadingSlash.startsWith('data/')
        ? withoutLeadingSlash
        : withoutLeadingSlash.startsWith('assets/')
            ? `data/${withoutLeadingSlash}`
            : withoutLeadingSlash;
    const withLeadingSlash = workspaceRelative.startsWith('/') ? workspaceRelative : `/${workspaceRelative}`;
    return withLeadingSlash.replace(/\/{2,}/g, '/');
}

function normalizeResourcePaths(paths: string[]): string[] {
    return [...new Set(paths.map(normalizeResourcePath).filter(Boolean))];
}

function resolveLocalOutputPath(outputPath: string): string {
    return path.isAbsolute(outputPath) ? outputPath : path.resolve(process.cwd(), outputPath);
}

function resolveLocalInputPath(inputPath: string): string {
    return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

export async function callFileTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<FileAction> | FileCategoryToolConfig<FileAction>,
    permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(FILE_TOOL_NAME, rawArgs, config, FILE_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const thresholdMB = 'uploadLargeFileThresholdMB' in config && typeof config.uploadLargeFileThresholdMB === 'number'
            ? config.uploadLargeFileThresholdMB
            : DEFAULT_LARGE_UPLOAD_THRESHOLD_MB;
        const largeUploadThresholdBytes = thresholdMB * 1024 * 1024;
        const parsedAction = FileActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(FILE_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'upload_asset': {
                const parsed = FileUploadAssetSchema.parse(rawArgs);
                const localFilePath = resolveLocalInputPath(parsed.localFilePath);
                if (!fs.existsSync(localFilePath)) {
                    throw new Error(`Local file does not exist: ${localFilePath}`);
                }
                const stat = fs.statSync(localFilePath);
                if (!stat.isFile()) {
                    throw new Error(`Local file path must point to a regular file: ${localFilePath}`);
                }
                if (stat.size > largeUploadThresholdBytes && parsed.confirmLargeFile !== true) {
                    return createJsonResult({
                        success: false,
                        requiresConfirmation: true,
                        reason: 'file_too_large',
                        localFilePath,
                        fileSizeBytes: stat.size,
                        thresholdBytes: largeUploadThresholdBytes,
                        thresholdMB,
                        message: `File exceeds the large-upload safety threshold (${thresholdMB} MB). Stop the current operation and ask the user for explicit confirmation before retrying with confirmLargeFile=true.`,
                    });
                }
                const fileName = path.basename(localFilePath);
                const fileBytes = fs.readFileSync(localFilePath);
                const result = await fileApi.uploadAsset(client, parsed.assetsDirPath, fileBytes, fileName);
                return createJsonResult({
                    ...result,
                    localFilePath,
                    uploadedFileName: fileName,
                    ...(stat.size > largeUploadThresholdBytes ? { largeFileConfirmed: true } : {}),
                });
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
                const result = normalizeMarkdownContent(await fileApi.exportMdContent(client, parsed.id));
                return createJsonResult(result);
            }
            case 'export_resources': {
                const parsed = FileExportResourcesSchema.parse(rawArgs);
                const normalizedPaths = normalizeResourcePaths(parsed.paths);
                if (normalizedPaths.length === 0) {
                    throw new Error('export_resources requires at least one non-empty resource path.');
                }

                let result;
                try {
                    result = await fileApi.exportResources(client, normalizedPaths, parsed.name);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`Failed to export resources. original_paths=${JSON.stringify(parsed.paths)} normalized_paths=${JSON.stringify(normalizedPaths)} cause=${message}`);
                }

                if (parsed.outputPath) {
                    const localOutputPath = resolveLocalOutputPath(parsed.outputPath);
                    const binary = await client.readFileBinary(result.path);
                    fs.mkdirSync(path.dirname(localOutputPath), { recursive: true });
                    fs.writeFileSync(localOutputPath, binary);
                    return createJsonResult({
                        ...result,
                        outputPath: localOutputPath,
                        bytes: binary.byteLength,
                    });
                }
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
