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
    return client.request<unknown[]>('/api/query/sql', request);
}

export async function searchTag(client: SiYuanClient, k: string): Promise<IResSearchTag> {
    const request: IReqSearchTag = { k };
    return client.request<IResSearchTag>('/api/search/searchTag', request);
}

export async function getBacklinkDoc(
    client: SiYuanClient,
    defID: string,
    keyword?: string,
): Promise<IResGetBacklinkDoc> {
    const request: IReqGetBacklinkDoc = { defID, keyword };
    return client.request<IResGetBacklinkDoc>('/api/ref/getBacklinkDoc', request);
}

export async function getBackmentionDoc(
    client: SiYuanClient,
    defID: string,
    keyword?: string,
): Promise<IResGetBackmentionDoc> {
    const request: IReqGetBackmentionDoc = { defID, keyword };
    return client.request<IResGetBackmentionDoc>('/api/ref/getBackmentionDoc', request);
}
