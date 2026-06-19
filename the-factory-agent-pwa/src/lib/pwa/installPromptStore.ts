'use client';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

let capturedPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener(capturedPrompt));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    capturedPrompt = e as BeforeInstallPromptEvent;
    notifyListeners();
  });

  window.addEventListener('appinstalled', () => {
    capturedPrompt = null;
    notifyListeners();
  });
}

export function getCapturedInstallPrompt(): BeforeInstallPromptEvent | null {
  return capturedPrompt;
}

export function subscribeInstallPrompt(
  listener: (prompt: BeforeInstallPromptEvent | null) => void,
): () => void {
  listeners.add(listener);
  listener(capturedPrompt);
  return () => listeners.delete(listener);
}

export function clearCapturedInstallPrompt(): void {
  capturedPrompt = null;
  notifyListeners();
}
