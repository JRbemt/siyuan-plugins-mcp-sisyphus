import { describe, expect, it } from 'vitest';

import { buildDefaultToolConfig, normalizeToolConfig } from '@/setting/tool-config';

describe('setting tool config', () => {
    it('enables document cover actions by default', () => {
        const config = buildDefaultToolConfig();

        expect(config.document.actions.set_cover).toBe(true);
        expect(config.document.actions.clear_cover).toBe(true);
        expect(config.file.actions.upload_asset).toBe(true);
        expect(config.file.uploadLargeFileThresholdMB).toBe(10);
    });

    it('keeps nested file config action toggles and upload threshold together', () => {
        const config = normalizeToolConfig({
            file: {
                enabled: true,
                uploadLargeFileThresholdMB: 25,
                actions: {
                    upload_asset: false,
                    render_template: true,
                },
            },
        });

        expect(config.file.enabled).toBe(true);
        expect(config.file.uploadLargeFileThresholdMB).toBe(25);
        expect(config.file.actions.upload_asset).toBe(false);
        expect(config.file.actions.render_template).toBe(true);
        expect(config.file.actions.render_sprig).toBe(true);
    });

    it.each([
        { input: 'bad', expected: 10, label: 'falls back for non-numeric values' },
        { input: 0, expected: 1, label: 'clamps low values to 1' },
        { input: 1.9, expected: 1, label: 'floors decimal values' },
        { input: 9999, expected: 1024, label: 'clamps high values to 1024' },
    ])('$label', ({ input, expected }) => {
        const config = normalizeToolConfig({
            file: {
                enabled: true,
                uploadLargeFileThresholdMB: input,
                actions: {
                    upload_asset: true,
                },
            },
        });

        expect(config.file.uploadLargeFileThresholdMB).toBe(expected);
    });
});
