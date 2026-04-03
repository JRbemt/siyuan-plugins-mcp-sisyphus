import { SiYuanClient } from './client';
import type {
    IReqFullTextSearchBlock,
    IReqGetBacklinkDoc,
    IReqGetBackmentionDoc,
    IReqQuerySQL,
    IReqSearchTag,
    IResFullTextSearchBlock,
    IResGetBacklinkDoc,
    IResGetBackmentionDoc,
    IResSearchTag,
} from '../types/api';

export async function fullTextSearchBlock(
    client: SiYuanClient,
    params: IReqFullTextSearchBlock,
): Promise<IResFullTextSearchBlock> {
    return client.request<IResFullTextSearchBlock>('/api/search/fullTextSearchBlock', params);
}

export async function querySQL(client: SiYuanClient, stmt: string): Promise<unknown[]> {
    const request: IReqQuerySQL = { stmt };
    const result = await client.request<unknown[] | null>('/api/query/sql', request);
    return Array.isArray(result) ? result : [];
}

export async function searchTag(client: SiYuanClient, k: string): Promise<IResSearchTag> {
    const request: IReqSearchTag = { k };
    return client.request<IResSearchTag>('/api/search/searchTag', request);
}

export async function getBacklinkDoc(
    client: SiYuanClient,
    defID: string,
    keyword?: string,
    refTreeID?: string,
): Promise<IResGetBacklinkDoc | null> {
    const request: IReqGetBacklinkDoc = { defID, keyword, refTreeID };
    return client.request<IResGetBacklinkDoc | null>('/api/ref/getBacklinkDoc', request);
}

export async function getBackmentionDoc(
    client: SiYuanClient,
    defID: string,
    keyword?: string,
    refTreeID?: string,
): Promise<IResGetBackmentionDoc | null> {
    const request: IReqGetBackmentionDoc = { defID, keyword, refTreeID };
    return client.request<IResGetBackmentionDoc | null>('/api/ref/getBackmentionDoc', request);
}
