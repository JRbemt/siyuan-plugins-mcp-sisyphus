import { SiYuanClient } from './client';

export async function listTags(
    client: SiYuanClient,
    options: { sort?: number; ignoreMaxListHint?: boolean; app?: string } = {},
): Promise<unknown> {
    const payload = { ...options, app: options.app || 'siyuan-mcp-sisyphus' };
    return client.request('/api/tag/getTag', payload);
}

export async function renameTag(client: SiYuanClient, oldLabel: string, newLabel: string): Promise<null> {
    return client.request<null>('/api/tag/renameTag', { oldLabel, newLabel });
}

export async function removeTag(client: SiYuanClient, label: string): Promise<null> {
    return client.request<null>('/api/tag/removeTag', { label });
}
