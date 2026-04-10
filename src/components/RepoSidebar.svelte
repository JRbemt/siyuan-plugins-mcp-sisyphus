<script lang="ts">
    import { onMount } from 'svelte';
    import { confirm, showMessage } from 'siyuan';
    import {
        getRepoSnapshots,
        getRepoTagSnapshots,
        createSnapshot,
        tagSnapshot,
        removeRepoTagSnapshot,
        diffRepoSnapshots,
        checkoutRepo,
        purgeRepo,
        type RepoSnapshot,
        type RepoSnapshotDiff,
    } from '@/api/repo';

    const PIN_TAG_PREFIX = '📌';

    function isPinned(snapId: string): boolean {
        return tagMap[snapId]?.startsWith(PIN_TAG_PREFIX) ?? false;
    }

    let snapshots: RepoSnapshot[] = [];
    let tagMap: Record<string, string> = {}; // snapshot id -> tag name
    let page = 1;
    let pageCount = 1;
    let totalCount = 0;
    let loading = false;
    let creating = false;
    let memoInput = '';
    let error: string | null = null;

    let selectedLeft: string | null = null;
    let selectedRight: string | null = null;
    let diffResult: RepoSnapshotDiff | null = null;
    let diffLoading = false;
    let diffOpen = true;
    let editingTagId: string | null = null;
    let editingTagValue = '';
    let tagSaving = false;
    let tagError: string | null = null;

    onMount(() => {
        loadFirstPage();
    });

    async function loadFirstPage() {
        page = 1;
        snapshots = [];
        editingTagId = null;
        editingTagValue = '';
        tagError = null;
        await Promise.all([loadPage(1, true), loadTags()]);
    }

    async function loadTags() {
        try {
            const data = await getRepoTagSnapshots();
            const map: Record<string, string> = {};
            for (const s of data.snapshots ?? []) {
                if (s.tag) map[s.id] = s.tag;
            }
            tagMap = map;
        } catch (err) {
            // Tag list is non-critical; surface but don't block.
            console.warn('[repo-sidebar] loadTags failed:', err);
        }
    }

    async function loadPage(p: number, replace = false) {
        if (loading) return;
        loading = true;
        error = null;
        try {
            const data = await getRepoSnapshots(p);
            page = p;
            pageCount = data.pageCount ?? 1;
            totalCount = data.totalCount ?? 0;
            snapshots = replace
                ? (data.snapshots ?? [])
                : [...snapshots, ...(data.snapshots ?? [])];
        } catch (err) {
            error = err instanceof Error ? err.message : String(err);
        } finally {
            loading = false;
        }
    }

    async function loadMore() {
        if (page >= pageCount) return;
        await loadPage(page + 1);
    }

    async function handleCreateSnapshot() {
        if (creating) return;
        const memo = memoInput.trim();
        if (!memo) {
            showMessage('请填写快照备注 (memo)');
            return;
        }
        creating = true;
        const prevTotal = totalCount;
        const prevTopId = snapshots[0]?.id ?? null;
        try {
            await createSnapshot(memo);
            // 内核对无变更 / 过于频繁的快照请求会返回 code:0 但不真正创建。
            // 重新拉第一页，判断列表顶部是否真的多了新项。
            await loadFirstPage();
            const created =
                totalCount > prevTotal ||
                (snapshots[0] && snapshots[0].id !== prevTopId);
            if (created) {
                // 自动打保护 tag，使快照不被 purgeRepo 清理
                const newSnap = snapshots[0];
                if (newSnap) {
                    const pinTag = `${PIN_TAG_PREFIX}${newSnap.id.slice(0, 8)}`;
                    try {
                        await tagSnapshot(newSnap.id, pinTag);
                        await loadTags();
                    } catch {
                        console.warn('[repo-sidebar] auto-pin tag failed');
                    }
                }
                memoInput = '';
                showMessage(`已创建快照: ${memo}`);
            } else {
                showMessage(
                    '未创建新快照：工作空间自上次快照后没有变化，或距离上次快照过近。',
                    6000,
                    'info',
                );
            }
        } catch (err) {
            showMessage(
                `创建快照失败: ${err instanceof Error ? err.message : String(err)}`,
                6000,
                'error',
            );
        } finally {
            creating = false;
        }
    }

    function toggleSelect(id: string) {
        if (selectedLeft === id) {
            selectedLeft = null;
        } else if (selectedRight === id) {
            selectedRight = null;
        } else if (!selectedLeft) {
            selectedLeft = id;
        } else if (!selectedRight) {
            selectedRight = id;
        } else {
            // both filled — replace the older (left) and shift
            selectedLeft = selectedRight;
            selectedRight = id;
        }
        maybeRunDiff();
    }

    async function maybeRunDiff() {
        if (!selectedLeft || !selectedRight) {
            diffResult = null;
            return;
        }
        diffLoading = true;
        diffResult = null;
        try {
            // dejavu convention: left = older, right = newer.
            // We pass them as user-selected; the kernel returns adds/updates/removes
            // relative to `left`.
            diffResult = await diffRepoSnapshots(selectedLeft, selectedRight);
        } catch (err) {
            showMessage(`Diff 失败: ${err instanceof Error ? err.message : String(err)}`, 5000, 'error');
        } finally {
            diffLoading = false;
        }
    }

    function startTagEdit(snap: RepoSnapshot) {
        if (editingTagId === snap.id) {
            editingTagId = null;
            editingTagValue = '';
            tagError = null;
            return;
        }
        editingTagId = snap.id;
        editingTagValue = tagMap[snap.id] ?? '';
        tagError = null;
    }

    function cancelTagEdit() {
        editingTagId = null;
        editingTagValue = '';
        tagError = null;
    }

    async function saveTagEdit(snap: RepoSnapshot) {
        if (tagSaving) return;
        const current = tagMap[snap.id] ?? '';
        const trimmed = editingTagValue.trim();
        if (trimmed === current) {
            cancelTagEdit();
            return;
        }
        tagSaving = true;
        tagError = null;
        try {
            if (!trimmed) {
                if (current) {
                    await removeRepoTagSnapshot(current);
                    showMessage(`已移除 tag: ${current}`);
                }
            } else {
                await tagSnapshot(snap.id, trimmed);
                showMessage(`已打 tag: ${trimmed}`);
            }
            await loadTags();
            cancelTagEdit();
        } catch (err) {
            tagError = err instanceof Error ? err.message : String(err);
            showMessage(`Tag 操作失败: ${tagError}`, 5000, 'error');
        } finally {
            tagSaving = false;
        }
    }

    function handleDelete(snap: RepoSnapshot) {
        const tag = tagMap[snap.id];
        confirm(
            '🗑️ 删除快照',
            `确定删除这个快照？\n\n${snap.created}  ${snap.memo}\n\n` +
                (tag ? `将移除标签「${tag}」并执行清理。\n` : '') +
                '⚠️ 注意：清理操作会同时移除所有未打 tag 的旧快照（含思源自动保存的），不可撤销。',
            async () => {
                try {
                    if (tag) {
                        await removeRepoTagSnapshot(tag);
                    }
                    await purgeRepo();
                    showMessage('已删除快照并清理未保护的旧数据');
                    await loadFirstPage();
                } catch (err) {
                    showMessage(
                        `删除失败: ${err instanceof Error ? err.message : String(err)}`,
                        6000,
                        'error',
                    );
                }
            },
        );
    }

    function handleCheckout(snap: RepoSnapshot) {
        confirm(
            '⚠️ 回滚整个工作空间',
            `确定要把整个 workspace 回滚到这个快照吗？\n\n${snap.created}  ${snap.memo}\n\n` +
                '当前未提交的修改将被覆盖丢失。建议先创建一次新快照再继续。\n回滚后需要重启思源生效。',
            async () => {
                try {
                    await checkoutRepo(snap.id);
                    showMessage('回滚成功，请重启思源生效。', 8000);
                } catch (err) {
                    showMessage(
                        `回滚失败: ${err instanceof Error ? err.message : String(err)}`,
                        6000,
                        'error',
                    );
                }
            },
        );
    }

    function selectedSnapshot(id: string | null): RepoSnapshot | undefined {
        return snapshots.find((snap) => snap.id === id);
    }
</script>

<div class="repo-sidebar">
    <div class="repo-sidebar__header">
        <div class="repo-sidebar__title">数据仓库 · 快照</div>
        <div class="repo-sidebar__create">
            <input
                class="b3-text-field repo-sidebar__memo"
                type="text"
                placeholder="快照备注 memo"
                bind:value={memoInput}
                disabled={creating}
                on:keydown={(e) => {
                    if (e.key === 'Enter') handleCreateSnapshot();
                }}
            />
            <button
                class="b3-button b3-button--outline"
                on:click={handleCreateSnapshot}
                disabled={creating}
            >
                {creating ? '创建中…' : '+ 快照'}
            </button>
        </div>
        <div class="repo-sidebar__hint">
            勾选两个快照查看 diff · 共 {totalCount} 个快照
        </div>
    </div>

    {#if error}
        <div class="repo-sidebar__error">加载失败: {error}</div>
    {/if}

    <div class="repo-sidebar__list">
        {#each snapshots as snap (snap.id)}
            {@const isLeft = selectedLeft === snap.id}
            {@const isRight = selectedRight === snap.id}
            {@const isSelected = isLeft || isRight}
            {@const isEditingTag = editingTagId === snap.id}
            <div
                class="repo-sidebar__item"
                class:selected={isSelected}
                class:left-selected={isLeft}
                class:right-selected={isRight}
                class:tag-editing={isEditingTag}
            >
                <button
                    class="repo-sidebar__select"
                    class:left={isLeft}
                    class:right={isRight}
                    title="选择用于 diff (最多两个)"
                    on:click={() => toggleSelect(snap.id)}
                >
                    {isLeft ? 'L' : isRight ? 'R' : ''}
                </button>
                <div class="repo-sidebar__meta">
                    <div class="repo-sidebar__line1">
                        <span class="repo-sidebar__time">{snap.created}</span>
                        {#if isPinned(snap.id)}
                            <span class="repo-sidebar__pin" title="受保护（自动标签）">📌</span>
                        {:else if tagMap[snap.id]}
                            <span class="repo-sidebar__tag">#{tagMap[snap.id]}</span>
                        {/if}
                        <span class="repo-sidebar__state" class:left={isLeft} class:right={isRight}>
                            {isLeft ? '左侧快照' : isRight ? '右侧快照' : '未选中'}
                        </span>
                    </div>
                    <div class="repo-sidebar__memo-text" title={snap.memo}>{snap.memo || '(无备注)'}</div>
                    {#if snap.hSize || snap.count}
                        <div class="repo-sidebar__sub">
                            {snap.count ? `${snap.count} 文件` : ''}
                            {snap.hSize ? `· ${snap.hSize}` : ''}
                        </div>
                    {/if}
                    {#if isEditingTag}
                        <div class="repo-sidebar__tag-editor">
                            <input
                                class="b3-text-field repo-sidebar__tag-input"
                                type="text"
                                placeholder="输入 tag，留空则移除"
                                bind:value={editingTagValue}
                                disabled={tagSaving}
                                on:keydown={(e) => {
                                    if (e.key === 'Enter') saveTagEdit(snap);
                                    if (e.key === 'Escape') cancelTagEdit();
                                }}
                            />
                            <div class="repo-sidebar__tag-actions">
                                <button
                                    class="b3-button b3-button--text"
                                    on:click={cancelTagEdit}
                                    disabled={tagSaving}
                                >
                                    取消
                                </button>
                                <button
                                    class="b3-button b3-button--outline"
                                    on:click={() => saveTagEdit(snap)}
                                    disabled={tagSaving}
                                >
                                    {tagSaving ? '保存中…' : '保存'}
                                </button>
                            </div>
                            {#if tagError}
                                <div class="repo-sidebar__tag-error">tag 保存失败：{tagError}</div>
                            {/if}
                        </div>
                    {/if}
                </div>
                <div class="repo-sidebar__actions">
                    <button
                        class="repo-sidebar__icon-btn"
                        class:active={isEditingTag}
                        class:disabled={isPinned(snap.id)}
                        title={isPinned(snap.id) ? '受保护快照，不可手动改 tag' : '打 tag / 改 tag'}
                        disabled={isPinned(snap.id)}
                        on:click={() => startTagEdit(snap)}
                    >
                        #
                    </button>
                    <button
                        class="repo-sidebar__icon-btn danger"
                        title="删除快照"
                        on:click={() => handleDelete(snap)}
                    >
                        🗑
                    </button>
                    <button
                        class="repo-sidebar__icon-btn repo-sidebar__icon-btn--rollback danger"
                        title="回滚到此快照 (高危)"
                        on:click={() => handleCheckout(snap)}
                    >
                        ⟲
                    </button>
                </div>
            </div>
        {/each}

        {#if loading}
            <div class="repo-sidebar__placeholder">加载中…</div>
        {:else if snapshots.length === 0}
            <div class="repo-sidebar__placeholder">暂无快照。点击上方「+ 快照」创建第一个。</div>
        {/if}

        {#if !loading && page < pageCount}
            <button class="b3-button b3-button--outline repo-sidebar__more" on:click={loadMore}>
                加载更多 ({page}/{pageCount})
            </button>
        {/if}
    </div>

    <div class="repo-sidebar__diff" class:open={diffOpen}>
        <button
            class="repo-sidebar__diff-header"
            on:click={() => (diffOpen = !diffOpen)}
        >
            <span class="caret">{diffOpen ? '▼' : '▶'}</span>
            Diff
            {#if selectedLeft && selectedRight}
                <span class="repo-sidebar__diff-range">L → R</span>
            {/if}
        </button>
        {#if diffOpen}
            <div class="repo-sidebar__diff-body">
                {#if selectedLeft || selectedRight}
                    <div class="repo-sidebar__diff-summary">
                        <div class="repo-sidebar__diff-chip left">
                            L · {selectedSnapshot(selectedLeft)?.memo || selectedSnapshot(selectedLeft)?.created || '未选择'}
                        </div>
                        <div class="repo-sidebar__diff-chip right">
                            R · {selectedSnapshot(selectedRight)?.memo || selectedSnapshot(selectedRight)?.created || '未选择'}
                        </div>
                    </div>
                {/if}
                {#if !selectedLeft || !selectedRight}
                    <div class="repo-sidebar__placeholder">勾选两个快照后自动比较</div>
                {:else if diffLoading}
                    <div class="repo-sidebar__placeholder">比较中…</div>
                {:else if diffResult}
                    {@const adds = diffResult.addsLeft ?? []}
                    {@const updates = diffResult.updatesLeft ?? []}
                    {@const removes = diffResult.removesLeft ?? []}
                    {#if adds.length === 0 && updates.length === 0 && removes.length === 0}
                        <div class="repo-sidebar__placeholder">两个快照内容一致</div>
                    {:else}
                        {#if adds.length}
                            <div class="repo-sidebar__diff-group">
                                <div class="repo-sidebar__diff-label add">+ 新增 ({adds.length})</div>
                                {#each adds as f}
                                    <div class="repo-sidebar__diff-file add" title={f.path}>{f.title || f.path}</div>
                                {/each}
                            </div>
                        {/if}
                        {#if updates.length}
                            <div class="repo-sidebar__diff-group">
                                <div class="repo-sidebar__diff-label update">~ 修改 ({updates.length})</div>
                                {#each updates as f}
                                    <div class="repo-sidebar__diff-file update" title={f.path}>{f.title || f.path}</div>
                                {/each}
                            </div>
                        {/if}
                        {#if removes.length}
                            <div class="repo-sidebar__diff-group">
                                <div class="repo-sidebar__diff-label remove">− 删除 ({removes.length})</div>
                                {#each removes as f}
                                    <div class="repo-sidebar__diff-file remove" title={f.path}>{f.title || f.path}</div>
                                {/each}
                            </div>
                        {/if}
                    {/if}
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .repo-sidebar {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--b3-theme-background);
        color: var(--b3-theme-on-background);
        font-size: 12px;
    }
    .repo-sidebar__header {
        padding: 8px 10px;
        border-bottom: 1px solid var(--b3-border-color);
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .repo-sidebar__title {
        font-weight: 600;
        font-size: 13px;
    }
    .repo-sidebar__create {
        display: flex;
        gap: 6px;
    }
    .repo-sidebar__memo {
        flex: 1;
        min-width: 0;
    }
    .repo-sidebar__hint {
        opacity: 0.65;
        font-size: 11px;
    }
    .repo-sidebar__error {
        padding: 6px 10px;
        color: var(--b3-card-error-color);
        background: var(--b3-card-error-background);
        font-size: 11px;
    }
    .repo-sidebar__list {
        flex: 1;
        overflow-y: auto;
        padding: 4px 0;
    }
    .repo-sidebar__item {
        display: flex;
        align-items: stretch;
        gap: 8px;
        padding: 8px 10px 8px 8px;
        border-bottom: 1px solid var(--b3-border-color);
        border-left: 3px solid transparent;
        border-radius: 10px;
        margin: 4px 8px;
        transition: background 0.12s, border-color 0.12s, box-shadow 0.12s, transform 0.12s;
    }
    .repo-sidebar__item:hover {
        background: var(--b3-list-hover);
        transform: translateY(-1px);
    }
    .repo-sidebar__item.selected {
        background: rgba(56, 132, 255, 0.18);
        border-left-color: #3884ff;
        box-shadow: 0 6px 18px rgba(56, 132, 255, 0.16);
    }
    .repo-sidebar__item.left-selected {
        background:
            linear-gradient(135deg, rgba(56, 132, 255, 0.22), rgba(56, 132, 255, 0.08)),
            var(--b3-theme-surface, var(--b3-theme-background));
        border-left-color: #3884ff;
        border-color: rgba(56, 132, 255, 0.32);
    }
    .repo-sidebar__item.right-selected {
        background:
            linear-gradient(135deg, rgba(255, 122, 61, 0.24), rgba(255, 122, 61, 0.08)),
            var(--b3-theme-surface, var(--b3-theme-background));
        border-left-color: #ff7a3d;
        border-color: rgba(255, 122, 61, 0.34);
    }
    .repo-sidebar__item.tag-editing {
        box-shadow: 0 0 0 1px rgba(56, 132, 255, 0.22);
    }
    .repo-sidebar__select {
        width: 34px;
        height: 34px;
        align-self: center;
        flex-shrink: 0;
        border: 2px solid var(--b3-border-color);
        background: var(--b3-theme-surface, var(--b3-theme-background));
        color: var(--b3-theme-on-background);
        border-radius: 10px;
        cursor: pointer;
        font-weight: 700;
        font-size: 14px;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.12s, border-color 0.12s, color 0.12s, box-shadow 0.12s, transform 0.12s;
    }
    .repo-sidebar__select:hover {
        border-color: #3884ff;
        transform: scale(1.04);
    }
    .repo-sidebar__select.left {
        background: linear-gradient(135deg, #4d96ff, #1f6feb);
        color: #ffffff;
        border-color: #3884ff;
        box-shadow: 0 0 0 3px rgba(56, 132, 255, 0.28);
    }
    .repo-sidebar__select.right {
        background: linear-gradient(135deg, #ff9b69, #ff7a3d);
        color: #ffffff;
        border-color: #ff7a3d;
        box-shadow: 0 0 0 3px rgba(255, 122, 61, 0.28);
    }
    .repo-sidebar__meta {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
    }
    .repo-sidebar__line1 {
        display: flex;
        gap: 6px;
        align-items: center;
    }
    .repo-sidebar__time {
        font-family: var(--b3-font-family-code, monospace);
        font-size: 11px;
        opacity: 0.8;
    }
    .repo-sidebar__tag {
        background: var(--b3-theme-primary);
        color: var(--b3-theme-on-primary);
        border-radius: 3px;
        padding: 0 4px;
        font-size: 10px;
    }
    .repo-sidebar__state {
        margin-left: auto;
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 999px;
        background: var(--b3-list-hover);
        opacity: 0.75;
    }
    .repo-sidebar__state.left {
        color: #3884ff;
        background: rgba(56, 132, 255, 0.12);
        opacity: 1;
    }
    .repo-sidebar__state.right {
        color: #ff7a3d;
        background: rgba(255, 122, 61, 0.14);
        opacity: 1;
    }
    .repo-sidebar__memo-text {
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .repo-sidebar__sub {
        opacity: 0.6;
        font-size: 10px;
    }
    .repo-sidebar__actions {
        display: flex;
        flex-direction: column;
        gap: 2px;
        justify-content: center;
    }
    .repo-sidebar__icon-btn {
        border: none;
        background: transparent;
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-size: 14px;
        padding: 2px 4px;
        border-radius: 3px;
        opacity: 0.7;
    }
    .repo-sidebar__icon-btn:hover {
        opacity: 1;
        background: var(--b3-list-hover);
    }
    .repo-sidebar__icon-btn.active {
        opacity: 1;
        background: rgba(56, 132, 255, 0.12);
        color: #3884ff;
    }
    .repo-sidebar__icon-btn.disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
    .repo-sidebar__icon-btn.danger:hover {
        color: var(--b3-card-error-color);
    }
    .repo-sidebar__icon-btn--rollback {
        font-size: 28px;
        padding: 4px 8px;
        min-width: 40px;
        min-height: 32px;
        line-height: 1;
        border-radius: 6px;
    }
    .repo-sidebar__pin {
        font-size: 12px;
        cursor: default;
    }
    .repo-sidebar__tag-editor {
        margin-top: 6px;
        padding: 8px;
        border-radius: 8px;
        background: var(--b3-theme-surface, rgba(127, 127, 127, 0.08));
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .repo-sidebar__tag-input {
        width: 100%;
    }
    .repo-sidebar__tag-actions {
        display: flex;
        justify-content: flex-end;
        gap: 6px;
    }
    .repo-sidebar__tag-error {
        font-size: 11px;
        color: var(--b3-card-error-color);
    }
    .repo-sidebar__placeholder {
        padding: 12px 10px;
        opacity: 0.6;
        text-align: center;
    }
    .repo-sidebar__more {
        margin: 8px auto;
        display: block;
    }
    .repo-sidebar__diff {
        border-top: 1px solid var(--b3-border-color);
        max-height: 40%;
        display: flex;
        flex-direction: column;
    }
    .repo-sidebar__diff-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        background: var(--b3-theme-surface, transparent);
        border: none;
        color: var(--b3-theme-on-background);
        cursor: pointer;
        font-weight: 600;
        text-align: left;
    }
    .repo-sidebar__diff-header .caret {
        font-size: 10px;
        opacity: 0.6;
    }
    .repo-sidebar__diff-range {
        margin-left: auto;
        opacity: 0.7;
        font-weight: normal;
        font-size: 11px;
    }
    .repo-sidebar__diff-body {
        overflow-y: auto;
        padding: 4px 10px 8px;
    }
    .repo-sidebar__diff-summary {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 8px;
    }
    .repo-sidebar__diff-chip {
        padding: 6px 8px;
        border-radius: 8px;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        background: var(--b3-list-hover);
    }
    .repo-sidebar__diff-chip.left {
        color: #3884ff;
        background: rgba(56, 132, 255, 0.12);
    }
    .repo-sidebar__diff-chip.right {
        color: #ff7a3d;
        background: rgba(255, 122, 61, 0.14);
    }
    .repo-sidebar__diff-group {
        margin-top: 6px;
    }
    .repo-sidebar__diff-label {
        font-weight: 600;
        font-size: 11px;
        margin: 4px 0 2px;
    }
    .repo-sidebar__diff-label.add {
        color: #2ea043;
    }
    .repo-sidebar__diff-label.update {
        color: #d29922;
    }
    .repo-sidebar__diff-label.remove {
        color: #f85149;
    }
    .repo-sidebar__diff-file {
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: 1px 0 1px 8px;
        border-left: 2px solid transparent;
    }
    .repo-sidebar__diff-file.add {
        border-left-color: #2ea043;
    }
    .repo-sidebar__diff-file.update {
        border-left-color: #d29922;
    }
    .repo-sidebar__diff-file.remove {
        border-left-color: #f85149;
        opacity: 0.75;
    }
</style>
