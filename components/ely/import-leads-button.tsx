"use client";

import { FileUp } from "lucide-react";
import { useRef, useState } from "react";

type Attachment = { id: string; name: string; rows: number };

type Props = {
    disabled?: boolean;
    /** Upload the CSV; returns the attachment ELY can read. */
    onAttach: (file: File) => Promise<Attachment | null>;
    /** Called once the file is attached, to ask ELY to check and import it. */
    onAttached: (attachment: Attachment) => void;
    onError?: (message: string) => void;
};

/** Attach a CSV lead list to the chat so ELY can preview and import it. */
export function ImportLeadsButton({ disabled = false, onAttach, onAttached, onError }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                data-testid="ely-import-leads-input"
                onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    if (!/\.csv$/i.test(file.name)) {
                        onError?.("Choose a CSV file. In Excel, use Save As > CSV first.");
                        return;
                    }
                    setUploading(true);
                    try {
                        const attachment = await onAttach(file);
                        if (attachment) onAttached(attachment);
                    } catch (err) {
                        onError?.(err instanceof Error ? err.message : "Could not attach the file.");
                    } finally {
                        setUploading(false);
                    }
                }}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || uploading}
                className="rounded-full border border-[#2D6F63] bg-[#113B37] px-3 py-1.5 text-[11px] text-[#B9E9DD] hover:bg-[#1B4D47] disabled:opacity-60"
            >
                <span className="inline-flex items-center gap-1">
                    <FileUp className="h-3.5 w-3.5" /> {uploading ? "Attaching…" : "Import Leads"}
                </span>
            </button>
        </>
    );
}
