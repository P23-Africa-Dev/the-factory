import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InlineVoiceRecorder } from "./inline-voice-recorder";

type Handler = ((event: { data: Blob }) => void) | null;

class MockMediaRecorder {
    static instances: MockMediaRecorder[] = [];
    mimeType: string;
    state = "inactive";
    ondataavailable: Handler = null;
    onstop: (() => void) | null = null;

    constructor(_stream: MediaStream, options?: { mimeType?: string }) {
        this.mimeType = options?.mimeType ?? "audio/webm";
        MockMediaRecorder.instances.push(this);
    }
    start() {
        this.state = "recording";
        this.ondataavailable?.({ data: new Blob(["audio"], { type: this.mimeType }) });
    }
    stop() {
        this.state = "inactive";
        this.onstop?.();
    }
    static isTypeSupported() {
        return true;
    }
}

function installMediaMocks() {
    MockMediaRecorder.instances = [];
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = MockMediaRecorder;

    Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    });

    const analyser = {
        fftSize: 128,
        smoothingTimeConstant: 0.78,
        frequencyBinCount: 64,
        connect: vi.fn(),
        getByteFrequencyData: vi.fn(),
    };
    class MockAudioContext {
        createMediaStreamSource() {
            return { connect: vi.fn() };
        }
        createAnalyser() {
            return analyser;
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

describe("InlineVoiceRecorder", () => {
    beforeEach(() => installMediaMocks());
    afterEach(() => vi.restoreAllMocks());

    it("records, stops, transcribes, and returns the text", async () => {
        const onTranscribe = vi.fn().mockResolvedValue("book a meeting with Ada");
        const onTranscribed = vi.fn();

        render(<InlineVoiceRecorder onTranscribe={onTranscribe} onTranscribed={onTranscribed} />);

        fireEvent.click(screen.getByRole("button", { name: "Record a voice message" }));

        const stopButton = await screen.findByRole("button", { name: "Stop recording and transcribe" });
        expect(screen.getByRole("button", { name: "Cancel recording" })).toBeTruthy();

        fireEvent.click(stopButton);

        await waitFor(() => expect(onTranscribe).toHaveBeenCalledTimes(1));
        expect(onTranscribe.mock.calls[0][0]).toBeInstanceOf(File);
        await waitFor(() => expect(onTranscribed).toHaveBeenCalledWith("book a meeting with Ada"));
    });

    it("discards the recording when cancelled", async () => {
        const onTranscribe = vi.fn().mockResolvedValue("ignored");
        const onTranscribed = vi.fn();

        render(<InlineVoiceRecorder onTranscribe={onTranscribe} onTranscribed={onTranscribed} />);

        fireEvent.click(screen.getByRole("button", { name: "Record a voice message" }));
        fireEvent.click(await screen.findByRole("button", { name: "Cancel recording" }));

        await waitFor(() => expect(screen.getByRole("button", { name: "Record a voice message" })).toBeTruthy());
        expect(onTranscribe).not.toHaveBeenCalled();
        expect(onTranscribed).not.toHaveBeenCalled();
    });
});
