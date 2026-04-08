import type { SiYuanClient } from '../../api/client';
import * as flashcardApi from '../../api/flashcard';
import type { CategoryToolConfig, FlashcardAction } from '../config';
import { FLASHCARD_ACTION_HINTS, FLASHCARD_GUIDANCE } from '../help';
import type { PermissionManager } from '../permissions';
import {
    FlashcardActionSchema,
    FlashcardAddCardSchema,
    FlashcardGetCardsSchema,
    FlashcardGetDecksSchema,
    FlashcardListCardsSchema,
    FlashcardRemoveCardSchema,
    FlashcardReviewCardSchema,
    FlashcardSkipReviewCardSchema,
} from '../types';
import { buildAggregatedTool, createActionSchema, createDisabledActionResult, createErrorResult, createJsonResult, type ActionVariant, type ToolResult, tryHandleHelpAction } from './shared';

export const FLASHCARD_TOOL_NAME = 'flashcard';

export const FLASHCARD_VARIANTS: ActionVariant<FlashcardAction>[] = [
    {
        action: 'list_cards',
        schema: createActionSchema('list_cards', {
            scope: { type: 'string', enum: ['all', 'deck', 'notebook', 'tree'], description: 'Query scope' },
            filter: { type: 'string', enum: ['due', 'new', 'old'], description: 'Card filter by review state' },
            deckID: { type: 'string', description: 'Deck ID, required when scope=deck' },
            notebook: { type: 'string', description: 'Notebook ID, required when scope=notebook' },
            rootID: { type: 'string', description: 'Root document/block ID, required when scope=tree' },
        }, ['scope', 'filter'], 'List due flashcards and optionally filter to new/old cards.'),
    },
    {
        action: 'get_decks',
        schema: createActionSchema('get_decks', {}, [], 'Get flashcard deck definitions.'),
    },
    {
        action: 'get_cards',
        schema: createActionSchema('get_cards', {
            deckID: { type: 'string', description: 'Deck ID (use empty string to query across all decks)' },
            page: { type: 'number', description: 'Page number (1-based), default 1' },
            pageSize: { type: 'number', description: 'Cards per page, default 32, max 512' },
        }, ['deckID'], 'List all cards in a deck with pagination (not limited to due cards).'),
    },
    {
        action: 'review_card',
        schema: createActionSchema('review_card', {
            deckID: { type: 'string', description: 'Deck ID' },
            cardID: { type: 'string', description: 'Card ID' },
            rating: { type: 'number', description: 'Review rating passed through to the kernel' },
            reviewedCards: { type: 'array', items: { type: 'object' }, description: 'Optional reviewedCards payload passed through to the kernel' },
        }, ['deckID', 'cardID', 'rating'], 'Submit a review result for one flashcard.'),
    },
    {
        action: 'skip_review_card',
        schema: createActionSchema('skip_review_card', {
            deckID: { type: 'string', description: 'Deck ID' },
            cardID: { type: 'string', description: 'Card ID' },
        }, ['deckID', 'cardID'], 'Skip the current flashcard in a review flow.'),
    },
    {
        action: 'add_card',
        schema: createActionSchema('add_card', {
            deckID: { type: 'string', description: 'Deck ID' },
            blockIDs: { type: 'array', items: { type: 'string' }, description: 'Existing block IDs to add as flashcards' },
        }, ['deckID', 'blockIDs'], 'Add existing blocks to a flashcard deck.'),
    },
    {
        action: 'remove_card',
        schema: createActionSchema('remove_card', {
            deckID: { type: 'string', description: 'Deck ID' },
            blockIDs: { type: 'array', items: { type: 'string' }, description: 'Existing block IDs to remove from a flashcard deck' },
        }, ['deckID', 'blockIDs'], 'Remove existing blocks from a flashcard deck.'),
    },
];

export function listFlashcardTools(config: CategoryToolConfig<FlashcardAction>) {
    return buildAggregatedTool(
        FLASHCARD_TOOL_NAME,
        '🃏 Grouped flashcard review and deck operations.',
        config,
        FLASHCARD_VARIANTS,
        {
            guidance: FLASHCARD_GUIDANCE,
            actionHints: FLASHCARD_ACTION_HINTS,
        },
    );
}

function isNewCardState(state: unknown): boolean {
    if (typeof state === 'string') {
        return ['new', '0'].includes(state.toLowerCase());
    }
    return state === 0;
}

function isOldCardState(state: unknown): boolean {
    if (typeof state === 'string') {
        return ['old', '1', 'review'].includes(state.toLowerCase());
    }
    return state === 1;
}

function filterCardsByState(cards: flashcardApi.Flashcard[], filter: 'due' | 'new' | 'old') {
    if (filter === 'due') return cards;
    if (filter === 'new') return cards.filter(card => isNewCardState(card.state));
    return cards.filter(card => isOldCardState(card.state));
}

export async function callFlashcardTool(
    client: SiYuanClient,
    args: Record<string, unknown> | undefined,
    config: CategoryToolConfig<FlashcardAction>,
    _permMgr: PermissionManager,
): Promise<ToolResult> {
    const rawArgs = args ?? {};
    const action = typeof rawArgs.action === 'string' ? rawArgs.action : undefined;

    const helpResult = tryHandleHelpAction(FLASHCARD_TOOL_NAME, rawArgs, config, FLASHCARD_VARIANTS);
    if (helpResult) return helpResult;

    try {
        const parsedAction = FlashcardActionSchema.parse(rawArgs.action);
        if (!config.enabled || !config.actions[parsedAction]) {
            return createDisabledActionResult(FLASHCARD_TOOL_NAME, parsedAction);
        }

        switch (parsedAction) {
            case 'list_cards': {
                const parsed = FlashcardListCardsSchema.parse(rawArgs);
                const result = parsed.scope === 'all'
                    ? await flashcardApi.getRiffDueCards(client)
                    : parsed.scope === 'deck'
                        ? await flashcardApi.getRiffDueCards(client, parsed.deckID)
                        : parsed.scope === 'notebook'
                            ? await flashcardApi.getNotebookRiffDueCards(client, parsed.notebook)
                            : await flashcardApi.getTreeRiffDueCards(client, parsed.rootID);

                return createJsonResult({
                    ...result,
                    action: 'list_cards',
                    scope: parsed.scope,
                    filter: parsed.filter,
                    ...(parsed.deckID ? { deckID: parsed.deckID } : {}),
                    ...(parsed.notebook ? { notebook: parsed.notebook } : {}),
                    ...(parsed.rootID ? { rootID: parsed.rootID } : {}),
                    cards: filterCardsByState(Array.isArray(result.cards) ? result.cards : [], parsed.filter),
                });
            }
            case 'get_decks': {
                FlashcardGetDecksSchema.parse(rawArgs);
                const result = await flashcardApi.getRiffDecks(client);
                return createJsonResult({
                    action: 'get_decks',
                    decks: result,
                });
            }
            case 'get_cards': {
                const parsed = FlashcardGetCardsSchema.parse(rawArgs);
                const result = await flashcardApi.getRiffCards(client, parsed.deckID, parsed.page ?? 1, parsed.pageSize);
                return createJsonResult({
                    action: 'get_cards',
                    deckID: parsed.deckID,
                    page: parsed.page ?? 1,
                    ...(parsed.pageSize !== undefined ? { pageSize: parsed.pageSize } : {}),
                    cards: Array.isArray(result?.cards) ? result.cards : [],
                    total: result?.total,
                    pageCount: result?.pageCount,
                });
            }
            case 'review_card': {
                const parsed = FlashcardReviewCardSchema.parse(rawArgs);
                const result = await flashcardApi.reviewRiffCard(client, parsed.deckID, parsed.cardID, parsed.rating, parsed.reviewedCards);
                return createJsonResult({
                    action: 'review_card',
                    deckID: parsed.deckID,
                    cardID: parsed.cardID,
                    rating: parsed.rating,
                    ...(parsed.reviewedCards !== undefined ? { reviewedCards: parsed.reviewedCards } : {}),
                    result,
                });
            }
            case 'skip_review_card': {
                const parsed = FlashcardSkipReviewCardSchema.parse(rawArgs);
                const result = await flashcardApi.skipReviewRiffCard(client, parsed.deckID, parsed.cardID);
                return createJsonResult({
                    action: 'skip_review_card',
                    deckID: parsed.deckID,
                    cardID: parsed.cardID,
                    result,
                });
            }
            case 'add_card': {
                const parsed = FlashcardAddCardSchema.parse(rawArgs);
                const result = await flashcardApi.addRiffCards(client, parsed.deckID, parsed.blockIDs);
                return createJsonResult({
                    action: 'add_card',
                    deckID: parsed.deckID,
                    blockIDs: parsed.blockIDs,
                    result,
                });
            }
            case 'remove_card': {
                const parsed = FlashcardRemoveCardSchema.parse(rawArgs);
                const result = await flashcardApi.removeRiffCards(client, parsed.deckID, parsed.blockIDs);
                return createJsonResult({
                    action: 'remove_card',
                    deckID: parsed.deckID,
                    blockIDs: parsed.blockIDs,
                    result,
                });
            }
            default: {
                const _exhaustive: never = parsedAction;
                return createErrorResult(new Error(`Unknown action: ${_exhaustive}`), { tool: FLASHCARD_TOOL_NAME, action, rawArgs });
            }
        }
    } catch (error) {
        return createErrorResult(error, { tool: FLASHCARD_TOOL_NAME, action, rawArgs });
    }
}
