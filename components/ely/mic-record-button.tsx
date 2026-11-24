"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 120;

type Props = {
    disabled?: boolean;
    /** Called with the finished recording; feeds the same flow as an uploaded voice note. */
    onRecorded: (file: File) => void;
    onError?: (message: string) => void;
};

function pickMimeType(): string | undefined {
    if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return undefined;
    return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * Record a voice note in the browser. Stops automatically after two minutes.
 * Hidden when the browser has no microphone support.
 */
export function MicRecordButton({ disabled = false, onRecorded, onError }: Props) {
    const [recording, setRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const supported =
        typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia;

    const cleanup = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    };

    useEffect(() => () => cleanup(), []);

    useEffect(() => {
        if (recording && seconds >= MAX_SECONDS) {
            recorderRef.current?.stop();
        }
    }, [recording, seconds]);

    if (!supported) return null;

    const start = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mimeType = pickMimeType();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            chunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };
            recorder.onstop = () => {
                cleanup();
                setRecording(false);
                const type = recorder.mimeType || mimeType || "audio/webm";
                const blob = new Blob(chunksRef.current, { type });
                if (blob.size === 0) {
                    onError?.("No audio was recorded. Check your microphone and try again.");
                    return;
                }
                const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
                onRecorded(new File([blob], `voice-note-${Date.now()}.${extension}`, { type }));
            };

            recorderRef.current = recorder;
            recorder.start();
            setSeconds(0);
            setRecording(true);
            timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
        } catch {
            cleanup();
            onError?.("Microphone access was blocked. Allow the microphone in your browser to record.");
        }
    };

    return (
        <button
            type="button"
            onClick={() => (recording ? recorderRef.current?.stop() : void start())}
            disabled={disabled && !recording}
            aria-pressed={recording}
            aria-label={recording ? "Stop recording" : "Record a voice note"}
            className="rounded-full border border-[#6B5A3B] bg-[#342A1A] px-3 py-1.5 text-[11px] text-[#F2D9A6] hover:bg-[#433322] disabled:opacity-60"
        >
            <span className="inline-flex items-center gap-1">
                {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {recording ? `Stop (${seconds}s)` : "Record"}
            </span>
        </button>
    );
}
