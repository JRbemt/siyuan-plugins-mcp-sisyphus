// Renderer-side wrapper for SiYuan kernel /api/repo/* (dejavu data repo).
// Runs inside the SiYuan Electron renderer process — same-origin fetch, no
// Authorization header required.

export interface RepoSnapshot {
    id: string;
    memo: string;
    created: string;     // formatted by kernel, e.g. "2026-04-09 14:32:01"
    hCreated?: string;
    count?: number;
    size?: number;
    hSize?: string;
    tag?: string;
    systemName?: string;
    systemOS?: string;
}

export interface RepoSnapshotPage {
    snapshots: RepoSnapshot[];
    pageCount: number;
    totalCount: number;
}

export interface RepoDiffFile {
    path: string;
    title?: string;
    hSize?: string;
    updated?: string;
}

export interface RepoSnapshotDiff {
    addsLeft: RepoDiffFile[];
    updatesLeft: RepoDiffFile[];
    removesLeft: RepoDiffFile[];
}

interface KernelResponse<T> {
    code: number;
    msg: string;
    data: T;
}

async function repoFetch<T>(endpoint: string, body: unknown = {}): Promise<T> {
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        throw new Error(`${endpoint} HTTP ${res.status}`);
    }
    const json = (await res.json()) as KernelResponse<T>;
    if (json.code !== 0) {
        throw new Error(json.msg || `${endpoint} failed (code ${json.code})`);
    }
    return json.data;
}

export function getRepoSnapshots(page: number): Promise<RepoSnapshotPage> {
    return repoFetch<RepoSnapshotPage>('/api/repo/getRepoSnapshots', { page });
}

export function getRepoTagSnapshots(): Promise<{ snapshots: RepoSnapshot[] }> {
    return repoFetch<{ snapshots: RepoSnapshot[] }>('/api/repo/getRepoTagSnapshots', {});
}

export function createSnapshot(memo: string): Promise<unknown> {
    return repoFetch<unknown>('/api/repo/createSnapshot', { memo });
}

export function tagSnapshot(id: string, name: string): Promise<unknown> {
    return repoFetch<unknown>('/api/repo/tagSnapshot', { id, name });
}

export function removeRepoTagSnapshot(tag: string): Promise<unknown> {
    return repoFetch<unknown>('/api/repo/removeRepoTagSnapshot', { tag });
}

export function diffRepoSnapshots(left: string, right: string): Promise<RepoSnapshotDiff> {
    return repoFetch<RepoSnapshotDiff>('/api/repo/diffRepoSnapshots', { left, right });
}

export function checkoutRepo(id: string): Promise<unknown> {
    return repoFetch<unknown>('/api/repo/checkoutRepo', { id });
}

export function openRepoSnapshotDoc(id: string): Promise<unknown> {
    return repoFetch<unknown>('/api/repo/openRepoSnapshotDoc', { id });
}

export interface RepoPurgeResult {
    indexes?: number;
    size?: number;
    hSize?: string;
}

export function purgeRepo(): Promise<RepoPurgeResult> {
    return repoFetch<RepoPurgeResult>('/api/repo/purgeRepo', {});
}
