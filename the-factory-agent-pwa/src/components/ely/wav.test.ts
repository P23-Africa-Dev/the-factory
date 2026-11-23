import { describe, expect, it } from "vitest";

import { downsample, encodeWav, mergeSamples } from "./wav";

describe("wav helpers", () => {
    it("merges sample blocks in order", () => {
        const merged = mergeSamples([new Float32Array([0.1, 0.2]), new Float32Array([0.3])]);
        expect(Array.from(merged).map((v) => Number(v.toFixed(1)))).toEqual([0.1, 0.2, 0.3]);
    });

    it("downsamples 48 kHz to 16 kHz by averaging groups of three", () => {
        const result = downsample(new Float32Array([0.3, 0.3, 0.3, -0.6, -0.6, -0.6]), 48000, 16000);
        expect(result.length).toBe(2);
        expect(result[0]).toBeCloseTo(0.3);
        expect(result[1]).toBeCloseTo(-0.6);
    });

    it("writes a valid 16 kHz mono 16-bit WAV header", async () => {
        const blob = encodeWav(new Float32Array(16000));
        expect(blob.type).toBe("audio/wav");
        expect(blob.size).toBe(44 + 16000 * 2);

        const view = new DataView(await blob.arrayBuffer());
        const text = (offset: number) => String.fromCharCode(...Array.from({ length: 4 }, (_, i) => view.getUint8(offset + i)));
        expect(text(0)).toBe("RIFF");
        expect(text(8)).toBe("WAVE");
        expect(view.getUint16(20, true)).toBe(1);
        expect(view.getUint16(22, true)).toBe(1);
        expect(view.getUint32(24, true)).toBe(16000);
        expect(view.getUint16(34, true)).toBe(16);
        expect(view.getUint32(40, true)).toBe(32000);
    });
});
