'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Camera, CloudOff, FileText, ImagePlus, Loader2, Paperclip, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { flattenApiError } from '@/lib/api/errors';
import { OverlayPortal } from '@/components/shared/OverlayPortal';
import { queueStopAttachment, removeQueuedAttachment, tripReportApi } from './api';
import { reportKeys } from './queries';
import { ATTACHMENT_ACCEPT, type StopAttachment } from './types';

const MAX_MB = 10;

/** Loads a server attachment through the authenticated API (no public URLs). */
function useAttachmentUrl(att: StopAttachment, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(att.localUrl ?? null);
  useEffect(() => {
    if (att.localUrl || att.pending || att.id <= 0 || !enabled) return undefined;
    let revoked = false;
    let objectUrl: string | null = null;
    void tripReportApi
      .attachmentBlob(att.id)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [att.id, att.localUrl, att.pending, enabled]);
  return url;
}

function Thumb({ att, onOpen, onRemove, readOnly }: { att: StopAttachment; onOpen: (url: string | null) => void; onRemove: () => void; readOnly?: boolean }) {
  const url = useAttachmentUrl(att, att.is_image);
  return (
    <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-white/12 bg-white/5">
      <button type="button" onClick={() => onOpen(url)} className="h-full w-full" aria-label={`Open ${att.original_name ?? 'attachment'}`}>
        {att.is_image && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-white/70">
            {att.is_image ? <Loader2 size={16} className="animate-spin" /> : <FileText size={18} />}
            {!att.is_image && <span className="w-full truncate text-center text-[9px]">{att.original_name ?? 'Document'}</span>}
          </span>
        )}
      </button>
      {att.pending && (
        <span className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] text-[#FBBF24]" title="Waiting to upload">
          <CloudOff size={9} /> Waiting
        </span>
      )}
      {!readOnly && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove attachment"
          className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * Photos and documents for a stop. Files are saved on the phone first (photos
 * compressed) and uploaded in the background, so it works with no signal.
 */
export function AttachmentPicker({
  tripId,
  stopId,
  clientStopId,
  attachments,
  max = 10,
  readOnly,
  onLocalAdd,
  onLocalRemove,
}: {
  tripId: number;
  /** Server id, or null/negative for a stop not synced yet (then clientStopId links them). */
  stopId: number | null;
  clientStopId?: string | null;
  attachments: StopAttachment[];
  max?: number;
  readOnly?: boolean;
  /** For a stop that does not exist yet (Add a stop): show what was picked. */
  onLocalAdd?: (att: StopAttachment) => void;
  onLocalRemove?: (att: StopAttachment) => void;
}) {
  const qc = useQueryClient();
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: reportKeys.report(tripId) });

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const room = max - attachments.length;
    const files = Array.from(list);
    if (files.length > room) toast.warning(`Up to ${max} files per stop`, room > 0 ? `Only the first ${room} were added.` : undefined);
    setBusy(true);
    try {
      for (const file of files.slice(0, Math.max(0, room))) {
        if (file.size > MAX_MB * 1_048_576 && !file.type.startsWith('image/')) {
          toast.error(`${file.name} is too large`, `Files can be up to ${MAX_MB} MB.`);
          continue;
        }
        const entry = await queueStopAttachment({
          tripId,
          stopId: stopId && stopId > 0 ? stopId : null,
          clientStopId: clientStopId ?? null,
          file,
        });
        onLocalAdd?.({
          id: -(entry.id ?? 0),
          client_attachment_id: entry.clientAttachmentId,
          field_stop_id: stopId ?? 0,
          mime_type: entry.mimeType,
          size_bytes: entry.fileBlob.size,
          original_name: entry.fileName,
          caption: null,
          is_image: entry.mimeType.startsWith('image/'),
          captured_at: entry.capturedAt,
          url: '',
          pending: true,
          localUrl: URL.createObjectURL(entry.fileBlob),
        });
      }
      await refresh();
      // Uploads run in the background; pick up the server copy when done.
      setTimeout(() => void refresh(), 4000);
    } catch (error) {
      toast.error('Could not add the file', flattenApiError(error));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (att: StopAttachment) => {
    try {
      if (att.pending || att.id < 0) await removeQueuedAttachment(-att.id);
      else await tripReportApi.deleteAttachment(att.id);
      onLocalRemove?.(att);
      await refresh();
    } catch (error) {
      toast.error('Could not remove the file', flattenApiError(error));
    }
  };

  const open = async (att: StopAttachment, url: string | null) => {
    if (att.is_image) {
      if (url) setViewer(url);
      return;
    }
    try {
      const href = url ?? URL.createObjectURL(await tripReportApi.attachmentBlob(att.id));
      const a = document.createElement('a');
      a.href = href;
      a.download = att.original_name ?? 'document';
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    } catch (error) {
      toast.error('Could not open the file', flattenApiError(error));
    }
  };

  const full = attachments.length >= max;

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {attachments.map((att) => (
            <Thumb key={`${att.id}-${att.client_attachment_id}`} att={att} readOnly={readOnly} onOpen={(url) => void open(att, url)} onRemove={() => void remove(att)} />
          ))}
        </div>
      )}
      {!readOnly && (
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              { ref: cameraRef, icon: Camera, label: 'Camera' },
              { ref: galleryRef, icon: ImagePlus, label: 'Gallery' },
              { ref: fileRef, icon: Paperclip, label: 'Document' },
            ].map(({ ref, icon: Icon, label }) => (
              <button
                key={label}
                type="button"
                disabled={busy || full}
                onClick={() => ref.current?.click()}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/15 text-[12px] font-medium text-white active:bg-white/5 disabled:opacity-40"
              >
                {busy && label === 'Camera' ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-white/45">
            {full ? `Limit reached (${max} files).` : `Photos, PDF, Word or Excel · up to ${max} files, ${MAX_MB} MB each`}
            {attachments.some((a) => a.pending) && ' · waiting files upload when you are online'}
          </p>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
          <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
          <input ref={fileRef} type="file" accept={ATTACHMENT_ACCEPT} multiple className="hidden" onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} />
        </>
      )}
      {viewer && (
        <OverlayPortal>
          <div className="fixed inset-0 z-[10080] flex items-center justify-center bg-black/95" onClick={() => setViewer(null)} role="dialog" aria-modal="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viewer} alt="" className="max-h-full max-w-full object-contain" />
            <button type="button" aria-label="Close" className="absolute right-4 top-[calc(env(safe-area-inset-top,0px)+24px)] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white">
              <X size={20} />
            </button>
          </div>
        </OverlayPortal>
      )}
    </div>
  );
}
