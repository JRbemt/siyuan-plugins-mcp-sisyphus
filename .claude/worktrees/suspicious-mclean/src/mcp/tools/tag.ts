import type { SiYuanClient } from '../../api/client';
import * as tagApi from '../../api/tag';
import type { CategoryToolConfig, TagAction } from '../config';
import { TAG_ACTION_HINTS, TAG_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    TagActionSchema,
    TagListSchema,
    TagRemoveSchema,
    TagRenameSchema,
} from '../types';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, type ActionVariant, type ToolResult } from './shared';

export const TAG_TOOL_NAME = 'tag';

export const TAG_VARIANTS: ActionVariant<TagAction>[] = [
    {
        action: 'list',
        schema: createActionSchema('list', {
            sort: { type: 'number', description: 'Optional tag sort mode' },
            ignoreMaxListHint: { type: 'boolean', description: 'Ignore SiYuan max list hint' },
            app: { type: 'string', description: 'Optional app identifier passed through to SiYuan' },
        }, [], 'List tags in the workspace.'),
    },
    {
        action: 'rename',
        schema: createActionSchema('rename', {
            oldLabel: { type: 'string', description: 'Existing tag label' },
            newLabel: { type: 'string', description: 'New tag label' },
        }, ['oldLabel', 'newLabel'], 'Rename a tag.'),
    },
    {
        action: 'remove',
        schema: createActionSchema('remove', {
            label: { type: 'string', description: 'Tag label to remove' },
        }, ['label'], 'Remove a tag.'),
    },
];

export function listTagTools(config: CategoryToolConfig<TagAction>) {
    return buildAggregatedTool(
        TAG_TOOL_NAME,
        '🏷️ Grouped tag operations.',
        config,
        TAG_VARIANTS,
        {
            guidance: TAG_GUIDANCE,
            actionHints: TAG_ACTION_HINTS,
        },
    );
}

export async function callTagTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<TagAction>,
    _permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    try {
        const parsedAction = TagActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(TAG_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'list': {
                const parsed = TagListSchema.parse(rawArgs);
                const result = await tagApi.listTags(client, parsed);
                return createJsonResult(result);
            }
            case 'rename': {
                const parsed = TagRenameSchema.parse(rawArgs);
                await tagApi.renameTag(client, parsed.oldLabel, parsed.newLabel);
                return createJsonResult({ success: true, oldLabel: parsed.oldLabel, newLabel: parsed.newLabel });
            }
            case 'remove': {
                const parsed = TagRemoveSchema.parse(rawArgs);
                await tagApi.removeTag(client, parsed.label);
                return createJsonResult({ success: true, label: parsed.label });
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: TAG_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: TAG_TOOL_NAME, action, rawArgs });
    }
}
