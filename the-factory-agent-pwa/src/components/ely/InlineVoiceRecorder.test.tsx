import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InlineVoiceRecorder } from "./InlineVoiceRecorder";

type AudioEvent = { inputBuffer: { getChannelData: (channel: number) => Float32Array } };

let processor: { onaudioprocess: ((event: AudioEvent) => void) | null; connect: () => void; disconnect: () => void };

function installAudioMocks() {
    processor = { onaudioprocess: null, connect: vi.fn(), disconnect: vi.fn() };

    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    });

    class MockAudioContext {
        sampleRate = 48000;
        destination = {};
        createMediaStreamSource() {
            return { connect: vi.fn() };
        }
        createAnalyser() {
            return { fftSize: 128, smoothingTimeConstant: 0.78, frequencyBinCount: 64, connect: vi.fn(), getByteFrequencyData: vi.fn() };
        }
        createScriptProcessor() {
            return processor;
        }
        resume() {
            return Promise.resolve();
        }
        close() {
            return Promise.resolve();
        }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
    globalThis.requestAnimationFrame = vi.fn().mockReturnValue(1);
    globalThis.cancelAnimationFrame = vi.fn();
}

/** Feed the processor `blocks` blocks of 4096 samples, as the browser would. */
function speak(blocks: number) {
    for (let i = 0; i < blocks; i++) {
        processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.25) } });
    }
}

describe("InlineVoiceRecorder", () => {
    beforeEach(() => installAudioMocks());
    afterEach(() => vi.restoreAllMocks());

    it("records, stops, sends a 16 kHz WAV for transcription, and returns the text", async () => {
        const onTranscribe = vi.fn().mockResolvedValue("book a meeting with Ada");
        const onTranscribed = vi.fn();

        render(<InlineVoiceRecorder onTranscribe={onTranscribe} onTranscribed={onTranscribed} />);

        fireEvent.click(screen.getByRole("button", { name: "Record a voice message" }));
        const stopButton = await screen.findByRole("button", { name: "Stop recording and transcribe" });
        expect(screen.getByRole("button", { name: "Cancel recording" })).toBeTruthy();

        act(() => speak(3));
        fireEvent.click(stopButton);

        await waitFor(() => expect(onTranscribe).toHaveBeenCalledTimes(1));
        const file = onTranscribe.mock.calls[0][0] as File;
        expect(file).toBeInstanceOf(File);
        expect(file.type).toBe("audio/wav");
        expect(file.name).toMatch(/\.wav$/);

        const header = new DataView(await file.arrayBuffer());
        expect(header.getUint32(24, true)).toBe(16000);

        await waitFor(() => expect(onTranscribed).toHaveBeenCalledWith("book a meeting with Ada"));
    });

    it("discards the recording when cancelled", async () => {
        const onTranscribe = vi.fn().mockResolvedValue("ignored");
        const onTranscribed = vi.fn();

        render(<InlineVoiceRecorder onTranscribe={onTranscribe} onTranscribed={onTranscribed} />);

        fireEvent.click(screen.getByRole("button", { name: "Record a voice message" }));
        const cancelButton = await screen.findByRole("button", { name: "Cancel recording" });
        act(() => speak(3));
        fireEvent.click(cancelButton);

        await waitFor(() => expect(screen.getByRole("button", { name: "Record a voice message" })).toBeTruthy());
        expect(onTranscribe).not.toHaveBeenCalled();
        expect(onTranscribed).not.toHaveBeenCalled();
    });

    it("reports an empty recording instead of sending it", async () => {
        const onTranscribe = vi.fn();
        const onError = vi.fn();

        render(<InlineVoiceRecorder onTranscribe={onTranscribe} onTranscribed={vi.fn()} onError={onError} />);

        fireEvent.click(screen.getByRole("button", { name: "Record a voice message" }));
        fireEvent.click(await screen.findByRole("button", { name: "Stop recording and transcribe" }));

        await waitFor(() => expect(onError).toHaveBeenCalled());
        expect(onTranscribe).not.toHaveBeenCalled();
    });
});
