'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import { AlertTriangle, Clock, Download, FileText, Loader2, Share2, Trash2 } from 'lucide-react';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { driveApi, driveErrorMessage } from '../api';
import { saveDriveBlob } from '../download';
import { driveKeys, useDeleteDriveFile, useDriveFile } from '../queries';
import type { DriveFile, DriveMemberLoader } from '../types';
import { driveExpiryLabel, drivePreviewKind, formatDriveBytes, formatDriveDate } from '../utils';
import { DriveConfirmDialog, DriveSheet } from './DriveSheet';
import { DriveShareSheet } from './DriveShareSheet';

/** Android WebViews (and Chrome on Android) can't show PDFs in an iframe. */
function canEmbedPdf(): boolean {
  try {
    if (Capacitor.getPlatform() === 'android') return false;
  } catch {
    // not in Capacitor
  }
  return typeof navigator === 'undefined' || !/Android/i.test(navigator.userAgent);
}

function useBlobSource<T extends HTMLImageElement | HTMLIFrameElement>(blob: Blob | undefined) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !blob) return;
    const url = URL.createObjectURL(blob);
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return ref;
}

function BlobImage({ blob, alt }: { blob: Blob; alt: string }) {
  const ref = useBlobSource<HTMLImageElement>(blob);
  // eslint-disable-next-line @next/next/no-img-element -- blob URL preview, not an optimisable asset
  return <img ref={ref} alt={alt} className="w-full max-h-[60vh] object-contain rounded-xl bg-black/30" />;
}

function BlobPdf({ blob, title }: { blob: Blob; title: string }) {
  const ref = useBlobSource<HTMLIFrameElement>(blob);
  return <iframe ref={ref} title={title} className="w-full h-[60vh] rounded-xl bg-white" />;
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-10 px-4 rounded-2xl bg-white/[0.03] border border-white/10">
      <AlertTriangle className="w-8 h-8 text-amber-400" />
      <p className="text-sm text-white/80">{message}</p>
    </div>
  );
}

export function DrivePreviewSheet({
  fileId,
  initialFile,
  loadMembers,
  onClose,
}: {
  fileId: number;
  /** The row from the list, when we have it; otherwise the file is fetched. */
  initialFile?: DriveFile | null;
  loadMembers?: DriveMemberLoader;
  onClose: () => void;
}) {
  const companyId = getActiveCompanyId();
  const fileQuery = useDriveFile(initialFile ? null : fileId);
  const file = initialFile ?? fileQuery.data ?? null;

  const kind = file ? drivePreviewKind(file) : 'other';
  const inline = kind === 'image' || (kind === 'pdf' && canEmbedPdf());

  const blobQuery = useQuery({
    queryKey: [...driveKeys.all, 'blob', companyId, fileId] as const,
    queryFn: () => driveApi.fetchBlob(fileId),
    enabled: file != null && inline,
    staleTime: Infinity,
    gcTime: 30_000,
    retry: false,
  });

  const deleteFile = useDeleteDriveFile();
  const [isSaving, setIsSaving] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDownload = async () => {
    if (!file) return;
    setIsSaving(true);
    try {
      const blob = blobQuery.data ?? (await driveApi.fetchBlob(file.id));
      const result = await saveDriveBlob(blob, file.original_name);
      if (result === 'unsupported') {
        toast.info(
          "Can't save files in the app yet",
          'Open Company Drive on the web to download this file.',
        );
      }
    } catch (error) {
      toast.error('Download failed', driveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!file) return;
    try {
      await deleteFile.mutateAsync(file.id);
      setConfirmDelete(false);
      onClose();
    } catch {
      // toast shown by the mutation
    }
  };

  const expiry = file ? driveExpiryLabel(file) : null;

  let body: React.ReactNode;
  if (!file && fileQuery.isError) {
    body = <ErrorPanel message={driveErrorMessage(fileQuery.error)} />;
  } else if (!file) {
    body = (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[#75ADAF]" />
      </div>
    );
  } else {
    let preview: React.ReactNode;
    if (inline && blobQuery.isError) {
      preview = <ErrorPanel message={driveErrorMessage(blobQuery.error)} />;
    } else if (inline && !blobQuery.data) {
      preview = (
        <div className="flex justify-center items-center h-48 rounded-xl bg-white/[0.03]">
          <Loader2 className="w-6 h-6 animate-spin text-[#75ADAF]" />
        </div>
      );
    } else if (inline && blobQuery.data && kind === 'image') {
      preview = <BlobImage blob={blobQuery.data} alt={file.original_name} />;
    } else if (inline && blobQuery.data) {
      preview = <BlobPdf blob={blobQuery.data} title={file.original_name} />;
    } else {
      preview = (
        <div className="flex flex-col items-center text-center gap-3 py-10 rounded-2xl bg-white/[0.03] border border-white/10">
          <FileText className="w-10 h-10 text-[#75ADAF]" />
          <p className="text-sm text-white/70 px-6">
            {kind === 'pdf'
              ? "PDF preview isn't available on this device. Download the file to open it."
              : "There's no preview for this file type. Download it to open it."}
          </p>
        </div>
      );
    }

    body = (
      <div className="space-y-4">
        {preview}
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-white/40">Size</dt>
            <dd className="font-semibold text-white">{formatDriveBytes(file.size_bytes)}</dd>
          </div>
          <div>
            <dt className="text-white/40">Added</dt>
            <dd className="font-semibold text-white">{formatDriveDate(file.created_at)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-white/40">Folder</dt>
            <dd className="font-semibold text-white">{file.folder?.name ?? '—'}</dd>
          </div>
        </dl>
        {expiry && (
          <p className="flex items-center gap-2 text-xs text-amber-300">
            <Clock className="w-3.5 h-3.5" /> {expiry}
          </p>
        )}
      </div>
    );
  }

  const footer = file ? (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={handleDownload}
        disabled={isSaving}
        className="flex-1 h-11 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Download
      </button>
      {file.can_manage && (
        <>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label="Share"
            className="h-11 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white flex items-center gap-2 text-sm font-semibold"
          >
            <Share2 className="w-4 h-4" /> Share
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete"
            className="h-11 px-3 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-300 flex items-center"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  ) : null;

  return (
    <>
      <DriveSheet title={file?.original_name ?? 'File'} onClose={onClose} footer={footer}>
        {body}
      </DriveSheet>
      {shareOpen && file && <DriveShareSheet file={file} loadMembers={loadMembers} onClose={() => setShareOpen(false)} />}
      {confirmDelete && file && (
        <DriveConfirmDialog
          title="Delete file?"
          message={`"${file.original_name}" will be removed from Company Drive for everyone. This can't be undone.`}
          confirmLabel="Delete"
          busy={deleteFile.isPending}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
