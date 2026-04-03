import { SiYuanClient } from './client';

export async function getWorkspaceInfo(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getWorkspaceInfo', {});
}

export async function getNetwork(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getNetwork', {});
}

export async function getChangelog(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getChangelog', {});
}

export async function getConf(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getConf', {});
}

export async function getSysFonts(client: SiYuanClient): Promise<unknown> {
    return client.request('/api/system/getSysFonts', {});
}

export async function getBootProgress(client: SiYuanClient): Promise<{ progress: number; details: string }> {
    return client.request<{ progress: number; details: string }>('/api/system/bootProgress', {});
}
