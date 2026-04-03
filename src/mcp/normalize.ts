export interface MarkdownContentResult {
    content: string;
}

const ZERO_WIDTH_CHARS = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
const HTML_TAG_PATTERN = /<[^>]+>/g;

export function stripZeroWidthChars(value: string): string {
    return value.replace(ZERO_WIDTH_CHARS, '');
}

export function normalizeMarkdownContent<T extends MarkdownContentResult>(value: T): T {
    return {
        ...value,
        content: stripZeroWidthChars(value.content),
    };
}

export function normalizeKramdownResult<T extends { kramdown: string }>(value: T): T {
    return {
        ...value,
        kramdown: stripZeroWidthChars(value.kramdown),
    };
}

export function stripHtmlTags(value: string): string {
    return value.replace(HTML_TAG_PATTERN, '');
}

export function normalizeFullTextSearchResult<T extends { blocks?: unknown[] }>(
    value: T,
    stripHtml: boolean,
): T {
    if (!stripHtml || !Array.isArray(value.blocks)) {
        return value;
    }

    return {
        ...value,
        blocks: value.blocks.map((block) => {
            if (!block || typeof block !== 'object') {
                return block;
            }

            const typedBlock = block as Record<string, unknown>;
            const nextBlock = { ...typedBlock };
            const content = typeof typedBlock.content === 'string' ? typedBlock.content : undefined;
            if (content !== undefined) {
                nextBlock.plainContent = stripHtmlTags(content);
            }
            return nextBlock;
        }),
    };
}
