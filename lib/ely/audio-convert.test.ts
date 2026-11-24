import { describe, expect, it, vi } from "vitest";

import { isSpeechReadyAudio, prepareVoiceUpload, UNSUPPORTED_AUDIO_MESSAGE, UnsupportedAudioError } from "./audio-convert";

function fakeAudioBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
    return {
        numberOfChannels: channels.length,
        length: channels[0].length,
        sampleRate,
        duration: channels[0].length / sampleRate,
        getChannelData: (index: number) => channels[index],
    } as unknown as AudioBuffer;
}

describe("prepareVoiceUpload", () => {
    it("treats WAV and MP3 as ready to upload", () => {
        expect(isSpeechReadyAudio({ name: "a.wav", type: "" })).toBe(true);
        expect(isSpeechReadyAudio({ name: "note", type: "audio/mpeg" })).toBe(true);
        expect(isSpeechReadyAudio({ name: "a.m4a", type: "audio/mp4" })).toBe(false);
        expect(isSpeechReadyAudio({ name: "a.webm", type: "audio/webm" })).toBe(false);
    });

    it("passes MP3 files through without decoding", async () => {
        const createContext = vi.fn();
        const file = new File(["mp3"], "note.mp3", { type: "audio/mpeg" });
        await expect(prepareVoiceUpload(file, createContext)).resolves.toBe(file);
        expect(createContext).not.toHaveBeenCalled();
    });

    it("converts an m4a file to 16 kHz mono WAV", async () => {
        const left = new Float32Array(48000).fill(0.5);
        const right = new Float32Array(48000).fill(-0.5);
        const close = vi.fn().mockResolvedValue(undefined);
        const decodeAudioData = vi.fn().mockResolvedValue(fakeAudioBuffer([left, right], 48000));

        const file = new File(["m4a-bytes"], "meeting.m4a", { type: "audio/mp4" });
        const result = await prepareVoiceUpload(file, () => ({ decodeAudioData, close }));

        expect(decodeAudioData).toHaveBeenCalledTimes(1);
        expect(result.name).toBe("meeting.wav");
        expect(result.type).toBe("audio/wav");
        // One second at 16 kHz, 16-bit mono, plus the 44-byte header.
        expect(result.size).toBe(44 + 16000 * 2);

        const view = new DataView(await result.arrayBuffer());
        expect(view.getUint16(22, true)).toBe(1); // mono
        expect(view.getUint32(24, true)).toBe(16000);
        // Opposite channels downmix to silence.
        expect(view.getInt16(44, true)).toBe(0);
        expect(close).toHaveBeenCalled();
    });

    it("throws a friendly error when the browser cannot decode the file", async () => {
        const decodeAudioData = vi.fn().mockRejectedValue(new Error("EncodingError"));
        const file = new File(["???"], "note.ogg", { type: "audio/ogg" });

        const error = await prepareVoiceUpload(file, () => ({ decodeAudioData })).catch((err) => err);
        expect(error).toBeInstanceOf(UnsupportedAudioError);
        expect(error.message).toBe(UNSUPPORTED_AUDIO_MESSAGE);
    });
});
