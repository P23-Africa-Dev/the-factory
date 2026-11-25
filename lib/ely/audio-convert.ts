/**
 * Convert an uploaded voice note into a format ELY's speech-to-text accepts.
 *
 * GLM-ASR takes only WAV or MP3, and the OpenAI fallback is not always
 * available, so other formats (m4a, ogg, webm, ...) are decoded in the
 * browser and re-encoded as 16 kHz mono 16-bit WAV before upload.
 */

import { downsample, encodeWav, SPEECH_SAMPLE_RATE } from "./wav";

/** File types the voice-note picker offers. */
export const VOICE_UPLOAD_ACCEPT =
    ".mp3,.wav,.m4a,.ogg,.webm,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/mp4,audio/x-m4a,audio/ogg,audio/webm";

export const UNSUPPORTED_AUDIO_MESSAGE =
    "This audio format isn't supported. Record in the chat or upload WAV/MP3.";

export class UnsupportedAudioError extends Error {
    constructor() {
        super(UNSUPPORTED_AUDIO_MESSAGE);
        this.name = "UnsupportedAudioError";
    }
}

const READY_MIME_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave", "audio/mpeg", "audio/mp3"]);

/** True when the file is already WAV or MP3 and can be uploaded as is. */
export function isSpeechReadyAudio(file: Pick<File, "name" | "type">): boolean {
    const type = (file.type || "").toLowerCase();
    if (READY_MIME_TYPES.has(type)) return true;
    return /\.(wav|mp3)$/i.test(file.name || "");
}

type AudioContextLike = {
    decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer>;
    close?: () => Promise<void>;
};

function defaultAudioContext(): AudioContextLike | null {
    if (typeof window === "undefined") return null;
    const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
}

function downmixToMono(buffer: AudioBuffer): Float32Array {
    const channels = buffer.numberOfChannels;
    if (channels <= 1) return buffer.getChannelData(0);
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < channels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) mono[i] += data[i] / channels;
    }
    return mono;
}

async function readArrayBuffer(file: File): Promise<ArrayBuffer> {
    if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
    return new Response(file).arrayBuffer();
}

/**
 * Return a WAV/MP3 file for upload. WAV and MP3 pass through unchanged;
 * anything else is decoded and re-encoded as 16 kHz mono WAV.
 * Throws UnsupportedAudioError when the browser cannot decode the file.
 */
export async function prepareVoiceUpload(
    file: File,
    createContext: () => AudioContextLike | null = defaultAudioContext
): Promise<File> {
    if (isSpeechReadyAudio(file)) return file;

    const context = createContext();
    if (!context) throw new UnsupportedAudioError();

    try {
        const decoded = await context.decodeAudioData(await readArrayBuffer(file));
        const samples = downsample(downmixToMono(decoded), decoded.sampleRate, SPEECH_SAMPLE_RATE);
        const rate = decoded.sampleRate < SPEECH_SAMPLE_RATE ? decoded.sampleRate : SPEECH_SAMPLE_RATE;
        const wav = encodeWav(samples, rate);
        const baseName = (file.name || "voice-note").replace(/\.[^./\\]+$/, "") || "voice-note";
        return new File([wav], `${baseName}.wav`, { type: "audio/wav" });
    } catch {
        throw new UnsupportedAudioError();
    } finally {
        void context.close?.().catch(() => undefined);
    }
}
