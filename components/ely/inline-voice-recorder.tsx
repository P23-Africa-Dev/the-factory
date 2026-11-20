"use client";

import { Loader2, Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 120;

type Props = {
    disabled?: boolean;
    /** Transcribe the recorded audio; returns the text. */
    onTranscribe: (file: File) => Promise<string>;
    /** Called with the transcript, for the composer to show before sending. */
    onTranscribed: (text: string) => void;
    onError?: (message: string) => void;
};

function pickMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
    return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
}

function formatClock(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * ChatGPT/Grok-style dictation that lives in the composer: a mic button that,
 * while recording, replaces the input with a live waveform and a timer; on
 * stop it transcribes and hands the text back so the user can review and edit
 * it before sending. On cancel nothing is sent.
 */
export function InlineVoiceRecorder({ disabled = false, onTranscribe, onTranscribed, onError }: Props) {
    const [recording, setRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [seconds, setSeconds] = useState(0);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const cancelledRef = useRef(false);

    const supported =
        typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia;

    const teardown = () => {
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        audioCtxRef.current?.close().catch(() => undefined);
        audioCtxRef.current = null;
        analyserRef.current = null;
    };

    useEffect(() => () => teardown(), []);

    // Auto-stop at the max duration.
    useEffect(() => {
        if (recording && seconds >= MAX_SECONDS) {
            recorderRef.current?.stop();
        }
    }, [recording, seconds]);

    const drawWaveform = () => {
        const analyser = analyserRef.current;
        const canvas = canvasRef.current;
        if (!analyser || !canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const bins = analyser.frequencyBinCount;
        const data = new Uint8Array(bins);
        analyser.getByteFrequencyData(data);

        const barCount = Math.min(28, Math.max(12, Math.floor(width / 8)));
        const gap = 3;
        const barWidth = (width - gap * (barCount - 1)) / barCount;
        const step = Math.floor(bins / barCount) || 1;

        ctx.fillStyle = "#16384B";
        for (let i = 0; i < barCount; i++) {
            const value = data[i * step] / 255;
            const barHeight = Math.max(3, value * value * height);
            const x = i * (barWidth + gap);
            const y = (height - barHeight) / 2;
            const radius = Math.min(barWidth / 2, 3);
            ctx.beginPath();
            // Rounded bar (fallback to rect if roundRect is unavailable).
            if (typeof ctx.roundRect === "function") {
                ctx.roundRect(x, y, barWidth, barHeight, radius);
            } else {
                ctx.rect(x, y, barWidth, barHeight);
            }
            ctx.fill();
        }

        rafRef.current = requestAnimationFrame(drawWaveform);
    };

    const start = async () => {
        if (disabled || transcribing) return;
        cancelledRef.current = false;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const audioCtx = new AudioCtx();
            await audioCtx.resume().catch(() => undefined);
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 128;
            analyser.smoothingTimeConstant = 0.78;
            source.connect(analyser);
            audioCtxRef.current = audioCtx;
            analyserRef.current = analyser;

            const mimeType = pickMimeType();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            chunksRef.current = [];
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
                if (timerRef.current) clearInterval(timerRef.current);
                timerRef.current = null;
                const type = recorder.mimeType || mimeType || "audio/webm";
                const blob = new Blob(chunksRef.current, { type });
                teardown();
                setRecording(false);
                if (cancelledRef.current) return;
                void handleFinished(blob, type);
            };

            recorderRef.current = recorder;
            recorder.start();
            setSeconds(0);
            setRecording(true);
            rafRef.current = requestAnimationFrame(drawWaveform);
            timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
        } catch {
            teardown();
            setRecording(false);
            onError?.("Microphone access was blocked. Allow the microphone in your browser to record.");
        }
    };

    const handleFinished = async (blob: Blob, type: string) => {
        if (blob.size === 0) {
            onError?.("No audio was recorded. Check your microphone and try again.");
            return;
        }
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-note-${Date.now()}.${extension}`, { type });
        setTranscribing(true);
        try {
            const text = (await onTranscribe(file)).trim();
            if (!text) {
                onError?.("No speech was detected. Try again, closer to the microphone.");
                return;
            }
            onTranscribed(text);
        } catch (err) {
            onError?.(err instanceof Error ? err.message : "Could not transcribe that recording.");
        } finally {
            setTranscribing(false);
        }
    };

    const stop = () => recorderRef.current?.stop();

    const cancel = () => {
        cancelledRef.current = true;
        recorderRef.current?.stop();
    };

    if (!supported) return null;

    if (transcribing) {
        return (
            <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-[40px] bg-[#DCE0E1] px-5 text-[13px] font-medium text-[#16384B]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Transcribing your voice note…
            </div>
        );
    }

    if (recording) {
        return (
            <div className="absolute inset-0 flex items-center gap-2 rounded-[40px] bg-[#DCE0E1] pl-3 pr-1.5">
                <button
                    type="button"
                    onClick={cancel}
                    aria-label="Cancel recording"
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[#091519]/70 hover:bg-black/5 hover:text-black"
                >
                    <X className="h-5 w-5" />
                </button>
                <span className="w-10 flex-shrink-0 text-[13px] font-semibold tabular-nums text-[#16384B]">{formatClock(seconds)}</span>
                <canvas ref={canvasRef} className="h-7 min-w-0 flex-1" aria-hidden />
                <span className="sr-only" role="status">Recording</span>
                <button
                    type="button"
                    onClick={stop}
                    aria-label="Stop recording and transcribe"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#16384B] text-white transition-colors hover:bg-[#16384B]/85"
                >
                    <Square className="h-4 w-4 fill-current" />
                </button>
            </div>
        );
    }

    return (
        <button
            type="button"
            onClick={() => void start()}
            disabled={disabled}
            aria-label="Record a voice message"
            title="Record a voice message"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[#091519] transition-colors hover:bg-black/5 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
            <Mic className="h-5 w-5" />
        </button>
    );
}
