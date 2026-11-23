/**
 * Helpers to turn microphone samples into a 16 kHz mono 16-bit WAV file, the
 * format every speech-to-text provider ELY uses accepts (GLM-ASR takes only
 * WAV or MP3, which browsers cannot record natively).
 */

export const SPEECH_SAMPLE_RATE = 16000;

/** Join recorded sample blocks into one buffer. */
export function mergeSamples(blocks: Float32Array[]): Float32Array {
    const length = blocks.reduce((total, block) => total + block.length, 0);
    const merged = new Float32Array(length);
    let offset = 0;
    for (const block of blocks) {
        merged.set(block, offset);
        offset += block.length;
    }
    return merged;
}

/** Resample by averaging, e.g. 48 kHz microphone audio down to 16 kHz. */
export function downsample(samples: Float32Array, fromRate: number, toRate: number = SPEECH_SAMPLE_RATE): Float32Array {
    if (toRate >= fromRate) return samples;
    const ratio = fromRate / toRate;
    const length = Math.floor(samples.length / ratio);
    const result = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        const start = Math.floor(i * ratio);
        const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
        let sum = 0;
        for (let j = start; j < end; j++) sum += samples[j];
        result[i] = end > start ? sum / (end - start) : 0;
    }
    return result;
}

/** Encode mono float samples (-1..1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number = SPEECH_SAMPLE_RATE): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeText = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    };

    writeText(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeText(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const value = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
    }

    return new Blob([buffer], { type: "audio/wav" });
}
