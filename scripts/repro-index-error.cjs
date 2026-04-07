#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = (process.env.SIYUAN_API_URL || 'http://127.0.0.1:6806').replace(/\/+$/, '');
const TOKEN = process.env.SIYUAN_TOKEN || '';
const LOOPS = parsePositiveInt(process.env.REPRO_LOOPS, 80);
const MIN_BASE_BLOCKS = parsePositiveInt(process.env.REPRO_BLOCKS, 4);
const KEEP_ON_FAIL = parseBoolean(process.env.REPRO_KEEP_ON_FAIL, true);
const ALWAYS_KEEP = parseBoolean(process.env.REPRO_ALWAYS_KEEP, false);
const REQUEST_TIMEOUT_MS = parsePositiveInt(process.env.REPRO_TIMEOUT_MS, 15000);
const LOG_FILE = process.env.REPRO_LOG_FILE || '';
const CONCURRENCY = parsePositiveInt(process.env.REPRO_CONCURRENCY, 3);
const READ_PROBES = parsePositiveInt(process.env.REPRO_READ_PROBES, 4);
const APPEND_BURST = parsePositiveInt(process.env.REPRO_APPEND_BURST, 4);
const UPDATE_BURST = parsePositiveInt(process.env.REPRO_UPDATE_BURST, 3);
const DELETE_BURST = parsePositiveInt(process.env.REPRO_DELETE_BURST, 3);

const state = {
    notebookId: null,
    notebookName: null,
    documentId: null,
    documentPath: null,
    createdAt: new Date().toISOString(),
    lastSuccessfulStep: null,
    roundsCompleted: 0,
    events: [],
};

main().catch((error) => {
    console.error(formatBanner('FAILED'));
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
});

async function main() {
    printConfig();

    const startedAt = Date.now();
    let failed = false;
    try {
        await collectEnvironmentInfo();
        await setupFixture();
        await runReproLoop();
        console.log(formatBanner('DONE'));
        console.log(`Completed ${state.roundsCompleted}/${LOOPS} rounds without capturing an index error.`);
    } catch (error) {
        failed = true;
        const details = error instanceof Error ? error.message : String(error);
        console.error(formatBanner('REPRO OR FAILURE CAPTURED'));
        console.error(details);
        console.error(`Last successful step: ${state.lastSuccessfulStep || 'none'}`);
        console.error(`Rounds completed: ${state.roundsCompleted}/${LOOPS}`);
        throw error;
    } finally {
        const shouldKeep = ALWAYS_KEEP || (failed && KEEP_ON_FAIL);
        await cleanupFixture({ shouldKeep }).catch((cleanupError) => {
            console.error(`[cleanup] ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        });
        await flushLog({
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            failed,
            keptFixture: shouldKeep,
        });
    }
}

async function collectEnvironmentInfo() {
    const version = await callApi('/api/system/version', {}, { label: 'system.version' }).catch(() => null);
    const currentTime = await callApi('/api/system/currentTime', {}, { label: 'system.currentTime' }).catch(() => null);
    logEvent('environment', {
        baseUrl: BASE_URL,
        version,
        currentTime,
    });
}

async function setupFixture() {
    const stamp = makeStamp();
    const notebookName = `Index Error Repro ${stamp}`;
    const createdNotebook = await callApi('/api/notebook/createNotebook', { name: notebookName }, { label: 'notebook.create' });
    const notebook = createdNotebook && typeof createdNotebook === 'object' && createdNotebook.notebook
        ? createdNotebook.notebook
        : createdNotebook;
    const notebookId = notebook && typeof notebook.id === 'string' ? notebook.id : null;
    if (!notebookId) {
        throw new Error(`Unexpected createNotebook result: ${safeJson(createdNotebook)}`);
    }

    const documentPath = `/Index Error Repro ${stamp}`;
    const documentId = await callApi('/api/filetree/createDocWithMd', {
        notebook: notebookId,
        path: documentPath,
        markdown: [
            '# Index Error Repro',
            '',
            `Created at: ${new Date().toISOString()}`,
            '',
            '- seed line A',
            '- seed line B',
        ].join('\n'),
    }, { label: 'document.create' });

    if (typeof documentId !== 'string' || !documentId) {
        throw new Error(`Unexpected createDocWithMd result: ${safeJson(documentId)}`);
    }

    state.notebookId = notebookId;
    state.notebookName = notebookName;
    state.documentId = documentId;
    state.documentPath = documentPath;

    await ensureMinimumBlocks(MIN_BASE_BLOCKS);
    state.lastSuccessfulStep = 'setup fixture';

    console.log(`[setup] notebook=${notebookId} doc=${documentId}`);
}

async function runReproLoop() {
    for (let round = 1; round <= LOOPS; round += 1) {
        console.log(`\n[round ${round}/${LOOPS}]`);

        const baselineBlocks = await getChildBlocks(`round ${round} baseline read`);
        if (baselineBlocks.length < Math.max(2, UPDATE_BURST)) {
            await ensureMinimumBlocks(MIN_BASE_BLOCKS);
        }

        const workingBlocks = await getChildBlocks(`round ${round} working read`);
        if (workingBlocks.length < Math.max(2, UPDATE_BURST)) {
            throw new Error(`Not enough blocks to run round ${round}. Current blocks: ${safeJson(workingBlocks)}`);
        }

        const updateTargets = workingBlocks.slice(0, Math.min(UPDATE_BURST, workingBlocks.length));
        const readProbe = runReadProbeBurst(round, 'overlap');

        await runPool(updateTargets, CONCURRENCY, (block, index) =>
            updateBlock(block?.id, buildUpdateMarkdown(round, index), `round ${round} update ${index + 1}`));

        const appendedBlocks = await mapPool(Array.from({ length: APPEND_BURST }, (_, index) => index), CONCURRENCY, async (index) =>
            appendBlock(`- temp append ${index + 1} round ${round}`, `round ${round} append ${index + 1}`));

        const deleteTargets = [
            ...appendedBlocks.slice(0, Math.min(DELETE_BURST, appendedBlocks.length)),
            ...updateTargets.slice(0, Math.max(0, DELETE_BURST - appendedBlocks.length)),
        ].slice(0, DELETE_BURST);

        await runPool(deleteTargets, CONCURRENCY, (block, index) =>
            deleteBlock(block?.id, `round ${round} delete ${index + 1}`));

        const overlapResults = await readProbe;
        verifyProbeResults(round, overlapResults, 'overlap');

        const postWriteResults = await runReadBurst(round, 'post-write');
        verifyProbeResults(round, postWriteResults, 'post-write');

        state.roundsCompleted = round;
        state.lastSuccessfulStep = `round ${round} concurrent read burst`;
    }
}

function buildUpdateMarkdown(round, index) {
    if (index === 0) {
        return [
            '## 空间对齐参数',
            '',
            `round=${round}`,
            `worker=${index + 1}`,
        ].join('\n');
    }

    return [
        '',
        `### ${round}-${index + 1}号 IMU（前右下坐标系）`,
        '',
        '| 设备 | X（前） | Y（右） | Z（下） |',
        '|:---:|:---:|:---:|:---:|',
        `| GPS | ${(round + index + 0.11).toFixed(2)} | ${(round + index + 0.22).toFixed(2)} | -1.16 |`,
        `| 声通 | ${(round + index + 0.11).toFixed(2)} | ${(round + index + 0.22).toFixed(2)} | -10.99 |`,
    ].join('\n');
}

async function runReadProbeBurst(round, phase) {
    return Promise.all(Array.from({ length: READ_PROBES }, (_, index) => readProbe(round, phase, index)));
}

async function runReadBurst(round, phase) {
    return Promise.all(Array.from({ length: READ_PROBES }, (_, index) => readProbe(round, phase, index)));
}

async function readProbe(round, phase, index) {
    const [docResult, childBlocksResult] = await Promise.allSettled([
        callApi('/api/filetree/getDoc', {
            id: state.documentId,
            mode: 0,
            size: 4096,
        }, { label: `round ${round} ${phase} getDoc #${index + 1}` }),
        callApi('/api/block/getChildBlocks', {
            id: state.documentId,
        }, { label: `round ${round} ${phase} getChildBlocks #${index + 1}` }),
    ]);

    return { docResult, childBlocksResult, phase, probe: index + 1 };
}

function verifyProbeResults(round, readResults, phase) {
    for (const readResult of readResults) {
        verifyReadResult(round, readResult, phase);
    }
}

function verifyReadResult(round, readResult, phase) {
    const { docResult, childBlocksResult, probe } = readResult;

    if (docResult.status === 'rejected') {
        throw annotateError(docResult.reason, `round ${round} ${phase} getDoc probe #${probe} failed`);
    }
    if (childBlocksResult.status === 'rejected') {
        throw annotateError(childBlocksResult.reason, `round ${round} ${phase} getChildBlocks probe #${probe} failed`);
    }

    const docPayload = docResult.value;
    const childBlocks = normalizeChildBlocks(childBlocksResult.value);
    if (!Array.isArray(childBlocks)) {
        throw new Error(`round ${round} ${phase} getChildBlocks probe #${probe} returned non-array payload: ${safeJson(childBlocksResult.value)}`);
    }
    if (childBlocks.length === 0) {
        throw new Error(`round ${round} ${phase} getChildBlocks probe #${probe} returned an empty array.`);
    }

    const docText = extractDocText(docPayload);
    if (docText !== null && docText.length === 0) {
        throw new Error(`round ${round} ${phase} getDoc probe #${probe} returned empty content: ${safeJson(docPayload)}`);
    }

    const blockIds = new Set(childBlocks.map((item) => item.id));
    if (blockIds.has(undefined)) {
        throw new Error(`round ${round} ${phase} getChildBlocks probe #${probe} returned malformed block IDs: ${safeJson(childBlocks)}`);
    }
}

async function ensureMinimumBlocks(minCount) {
    let current = await getChildBlocks('ensure minimum blocks');
    while (current.length < minCount) {
        await appendBlock(`- baseline block ${current.length + 1}`, `seed append ${current.length + 1}`);
        current = await getChildBlocks('refresh seeded blocks');
    }
}

async function appendBlock(markdown, label) {
    const result = await callApi('/api/block/appendBlock', {
        dataType: 'markdown',
        data: markdown,
        parentID: state.documentId,
    }, { label });
    const normalized = normalizeWriteResult(result);
    if (!normalized.id) {
        throw new Error(`${label} returned no block ID: ${safeJson(result)}`);
    }
    return normalized;
}

async function updateBlock(id, markdown, label) {
    if (!id) throw new Error(`${label} missing block id`);
    await callApi('/api/block/updateBlock', {
        dataType: 'markdown',
        data: markdown,
        id,
    }, { label });
}

async function deleteBlock(id, label) {
    if (!id) throw new Error(`${label} missing block id`);
    await callApi('/api/block/deleteBlock', { id }, { label });
}

async function getChildBlocks(label) {
    const result = await callApi('/api/block/getChildBlocks', { id: state.documentId }, { label });
    return normalizeChildBlocks(result);
}

async function cleanupFixture({ shouldKeep }) {
    if (!state.notebookId) return;
    if (shouldKeep) {
        console.log(`[cleanup] keeping fixture notebook=${state.notebookId} doc=${state.documentId}`);
        return;
    }

    console.log('[cleanup] removing fixture data');

    if (state.documentId) {
        await callApi('/api/filetree/removeDocByID', { id: state.documentId }, { label: 'cleanup remove document', allowFailure: true });
    }

    await callApi('/api/notebook/removeNotebook', { notebook: state.notebookId }, { label: 'cleanup remove notebook', allowFailure: true });
}

async function callApi(endpoint, payload, options = {}) {
    const label = options.label || endpoint;
    const startedAt = Date.now();
    try {
        const response = await fetchWithTimeout(`${BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(TOKEN ? { Authorization: `Token ${TOKEN}` } : {}),
            },
            body: JSON.stringify(payload || {}),
        }, REQUEST_TIMEOUT_MS);

        const rawText = await response.text();
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            parsed = rawText;
        }

        logEvent('api', {
            label,
            endpoint,
            payload,
            durationMs: Date.now() - startedAt,
            status: response.status,
            ok: response.ok,
            response: summarizeResponse(parsed),
        });

        if (!response.ok) {
            throw new Error(`${label} HTTP ${response.status}: ${truncate(rawText, 600)}`);
        }

        if (!parsed || typeof parsed !== 'object') {
            state.lastSuccessfulStep = label;
            return parsed;
        }

        if (parsed.code !== 0) {
            const error = new Error(`${label} SiYuan API error: ${parsed.code} - ${parsed.msg || 'unknown'}`);
            error.responseBody = parsed;
            throw error;
        }

        state.lastSuccessfulStep = label;
        return parsed.data;
    } catch (error) {
        if (options.allowFailure) {
            logEvent('api-allowed-failure', {
                label,
                endpoint,
                payload,
                message: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
        throw error;
    }
}

function normalizeWriteResult(result) {
    const operationBatch = Array.isArray(result) ? result[0] : result;
    const firstOperation = operationBatch && typeof operationBatch === 'object' && Array.isArray(operationBatch.doOperations)
        ? operationBatch.doOperations[0]
        : operationBatch;

    return firstOperation && typeof firstOperation === 'object'
        ? firstOperation
        : {};
}

function normalizeChildBlocks(result) {
    return Array.isArray(result) ? result.filter((item) => item && typeof item === 'object') : [];
}

function extractDocText(payload) {
    if (typeof payload === 'string') return payload;
    if (!payload || typeof payload !== 'object') return null;

    const content = [
        payload.content,
        payload.markdown,
        payload.html,
    ].find((value) => typeof value === 'string');

    return typeof content === 'string' ? content : null;
}

function printConfig() {
    console.log(formatBanner('CONFIG'));
    console.log(`baseUrl=${BASE_URL}`);
    console.log(`loops=${LOOPS}`);
    console.log(`minBaseBlocks=${MIN_BASE_BLOCKS}`);
    console.log(`concurrency=${CONCURRENCY}`);
    console.log(`readProbes=${READ_PROBES}`);
    console.log(`appendBurst=${APPEND_BURST}`);
    console.log(`updateBurst=${UPDATE_BURST}`);
    console.log(`deleteBurst=${DELETE_BURST}`);
    console.log(`keepOnFail=${KEEP_ON_FAIL}`);
    console.log(`alwaysKeep=${ALWAYS_KEEP}`);
    console.log(`timeoutMs=${REQUEST_TIMEOUT_MS}`);
    if (LOG_FILE) console.log(`logFile=${LOG_FILE}`);
    if (!TOKEN) console.log('token=<empty>');
}

function logEvent(type, payload) {
    const event = {
        ts: new Date().toISOString(),
        type,
        payload,
    };
    state.events.push(event);
    if (type === 'api') {
        const responseText = safeJson(payload.response);
        console.log(`[api] ${payload.label} -> ${payload.status} in ${payload.durationMs}ms ${responseText}`);
    }
}

async function flushLog(summary) {
    if (!LOG_FILE) return;
    const output = {
        summary: {
            ...summary,
            baseUrl: BASE_URL,
            notebookId: state.notebookId,
            notebookName: state.notebookName,
            documentId: state.documentId,
            documentPath: state.documentPath,
            roundsCompleted: state.roundsCompleted,
            lastSuccessfulStep: state.lastSuccessfulStep,
        },
        events: state.events,
    };

    const target = path.isAbsolute(LOG_FILE) ? LOG_FILE : path.join(process.cwd(), LOG_FILE);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[log] wrote ${target}`);
}

function summarizeResponse(value) {
    if (Array.isArray(value)) {
        return { type: 'array', length: value.length, first: summarizeResponse(value[0]) };
    }
    if (!value || typeof value !== 'object') return value;
    const record = value;
    const summary = {};
    for (const key of ['code', 'msg', 'id', 'rootID', 'path', 'hPath', 'content']) {
        if (record[key] !== undefined) summary[key] = key === 'content' ? truncate(String(record[key]), 120) : record[key];
    }
    if ('data' in record) {
        summary.data = summarizeResponse(record.data);
    }
    if (Object.keys(summary).length === 0) {
        for (const [key, val] of Object.entries(record).slice(0, 6)) {
            summary[key] = typeof val === 'string' ? truncate(val, 120) : val;
        }
    }
    return summary;
}

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
    if (value === undefined) return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

async function runPool(items, concurrency, worker) {
    await mapPool(items, concurrency, worker);
}

async function mapPool(items, concurrency, worker) {
    const results = new Array(items.length);
    let cursor = 0;

    const runners = Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
        while (cursor < items.length) {
            const currentIndex = cursor;
            cursor += 1;
            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    });

    await Promise.all(runners);
    return results;
}

function makeStamp() {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function safeJson(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function truncate(value, maxLength) {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

function formatBanner(title) {
    return `\n=== ${title} ===`;
}

function annotateError(error, prefix) {
    if (error instanceof Error) {
        error.message = `${prefix}: ${error.message}`;
        return error;
    }
    return new Error(`${prefix}: ${String(error)}`);
}

async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
