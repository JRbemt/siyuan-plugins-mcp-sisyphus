import { describe, expect, it } from 'vitest';

import { getIdleMotionDelayMs, pickNextIdleMotion } from '@/components/puppy-motion';

describe('puppy motion helpers', () => {
    it('rotates idle motions without repeating the current one', () => {
        expect(pickNextIdleMotion('stand', 0)).toBe('sit');
        expect(pickNextIdleMotion('stand', 0.99)).toBe('groom');
        expect(pickNextIdleMotion('groom', 0.5)).toBe('sit');
    });

    it('clamps idle motion delay into the supported range', () => {
        expect(getIdleMotionDelayMs(-1)).toBe(1800);
        expect(getIdleMotionDelayMs(0)).toBe(1800);
        expect(getIdleMotionDelayMs(1)).toBe(4000);
        expect(getIdleMotionDelayMs(99)).toBe(4000);
    });
});
