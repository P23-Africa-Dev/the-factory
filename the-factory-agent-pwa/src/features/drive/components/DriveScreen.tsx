'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Clock,
  File as FileIcon,
  FileImage,
  FileText,
  HardDrive,
  Loader2,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useAuthNavigation } from '@/features/auth';
import { driveErrorMessage } from '../api';
import { useDriveFiles, useDriveFolders, useDriveUsage, useUploadDriveFile } from '../queries';
import type { DriveFile, DriveMemberLoader } from '../types';
import {
  driveExpiryLabel,
  drivePreviewKind,
  formatDriveBytes,
  formatDriveDate,
  isElyReportsFolder,
  parseDriveFileParam,
} from '../utils';
import { DrivePreviewSheet } from './DrivePreviewSheet';

const PER_PAGE = 30;

function FileTypeIcon({ file }: { file: DriveFile }) {
  const kind = drivePreviewKind(file);
  const Icon = kind === 'image' ? FileImage : kind === 'pdf' ? FileText : FileIcon;
  return (
    <div className="p-2.5 rounded-xl bg-[#75ADAF]/15 text-[#75ADAF] shrink-0">
      <Icon className="w-5 h-5" />
    </div>
  );
}

function UsageBar() {
  const usage = useDriveUsage();
  if (usage.isLoading) {
    return <div className="h-[74px] rounded-2xl bg-white/5 border border-white/10 animate-pulse" />;
  }
  if (usage.isError || !usage.data) {
    return (
      <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs text-amber-300">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {driveErrorMessage(usage.error)}
      </div>
    );
  }
  const percent = Math.max(0, Math.min(100, Number(usage.data.percent) || 0));
  const barColor = percent >= 90 ? 'bg-red-400' : percent >= 75 ? 'bg-amber-400' : 'bg-[#75ADAF]';
  return (
    <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-2 font-semibold text-white">
          <HardDrive className="w-4 h-4 text-[#75ADAF]" /> Storage
        </span>
        <span className="text-white/60">
          {formatDriveBytes(usage.data.used_bytes)} of {formatDriveBytes(usage.data.limit_bytes)}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-white/10 overflow-hidden"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Drive storage used"
      >
        <div className={`h-full ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function DriveScreen({
  area,
  loadMembers,
}: {
  area: 'agent' | 'manager';
  /** Company members for the share picker (manager screen only). */
  loadMembers?: DriveMemberLoader;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { goBack } = useAuthNavigation();

  const [folderId, setFolderId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dismissedDeepLinkId, setDismissedDeepLinkId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Debounce the search box.
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const deepLinkId = parseDriveFileParam(searchParams.get('file'));
  const activeId = selectedId ?? (deepLinkId !== dismissedDeepLinkId ? deepLinkId : null);

  const folders = useDriveFolders();
  const files = useDriveFiles({
    folder_id: folderId ?? undefined,
    search: search || undefined,
    page,
    per_page: PER_PAGE,
  });
  const upload = useUploadDriveFile();

  const folderList = useMemo(() => folders.data ?? [], [folders.data]);
  const selectedFolder = folderList.find((folder) => folder.id === folderId) ?? null;
  const canUpload = area === 'manager' && selectedFolder != null;
  const items = files.data?.items ?? [];
  const pagination = files.data?.pagination;
  const activeFile = activeId != null ? (items.find((item) => item.id === activeId) ?? null) : null;

  const selectFolder = (id: number | null) => {
    setFolderId(id);
    setPage(1);
  };

  const closePreview = () => {
    setSelectedId(null);
    if (deepLinkId != null) {
      setDismissedDeepLinkId(deepLinkId);
      router.replace(pathname);
    }
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!selectedFolder || picked.length === 0) return;
    for (const file of picked) {
      try {
        await upload.mutateAsync({ folderId: selectedFolder.id, file });
      } catch {
        // toast shown by the mutation; keep going with the rest
      }
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0A1D25] text-white">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 pb-4 pt-[calc(env(safe-area-inset-top,0px)+16px)] bg-[#0A1D25]/90 backdrop-blur border-b border-white/10">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-2 text-sm text-[#75ADAF] hover:text-white transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-base font-semibold">Company Drive</h1>
        <div className="w-12" />
      </div>

      <div className="flex-1 px-4 py-5 space-y-4 max-w-lg mx-auto w-full pb-28">
        <UsageBar />

        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search files…"
            aria-label="Search files"
            className="w-full h-11 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#75ADAF]"
          />
        </label>

        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 no-scrollbar" role="tablist" aria-label="Folders">
          <button
            type="button"
            role="tab"
            aria-selected={folderId === null}
            onClick={() => selectFolder(null)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              folderId === null ? 'bg-[#75ADAF] border-[#75ADAF] text-white' : 'bg-white/5 border-white/10 text-white/70'
            }`}
          >
            All files
          </button>
          {folderList.map((folder) => (
            <button
              key={folder.id}
              type="button"
              role="tab"
              aria-selected={folderId === folder.id}
              onClick={() => selectFolder(folder.id)}
              className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                folderId === folder.id
                  ? 'bg-[#75ADAF] border-[#75ADAF] text-white'
                  : 'bg-white/5 border-white/10 text-white/70'
              }`}
            >
              {isElyReportsFolder(folder) && <Sparkles className="w-3 h-3" />}
              {folder.name}
            </button>
          ))}
        </div>

        {isElyReportsFolder(selectedFolder) && (
          <div className="flex gap-2.5 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
            <Clock className="w-4 h-4 shrink-0 mt-0.5" />
            <p>ELY saves your weekly report PDFs here. Reports are deleted automatically 60 days after they are created, so download any you want to keep.</p>
          </div>
        )}

        {area === 'manager' && (
          <div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
            <button
              type="button"
              disabled={!canUpload || upload.isPending}
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-11 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {upload.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {upload.isPending ? 'Uploading…' : selectedFolder ? `Upload to ${selectedFolder.name}` : 'Upload'}
            </button>
            {!selectedFolder && (
              <p className="mt-1.5 text-[11px] text-white/40 text-center">Pick a folder to upload into.</p>
            )}
          </div>
        )}

        {files.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[#75ADAF]" />
          </div>
        ) : files.isError ? (
          <div className="flex flex-col items-center text-center gap-3 py-12 px-4 rounded-2xl bg-white/[0.03] border border-white/10">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
            <p className="text-sm text-white/80">{driveErrorMessage(files.error)}</p>
            <button
              type="button"
              onClick={() => files.refetch()}
              className="px-5 py-2 rounded-full bg-white/10 text-xs font-semibold text-[#75ADAF]"
            >
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2 py-14 rounded-2xl bg-white/[0.03] border border-white/10">
            <FileIcon className="w-7 h-7 text-white/30" />
            <p className="text-sm text-white/60">{search ? 'No files match your search.' : 'No files here yet.'}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((file) => {
              const expiry = driveExpiryLabel(file);
              return (
                <li key={file.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(file.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-left transition-colors"
                  >
                    <FileTypeIcon file={file} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{file.original_name}</span>
                      <span className="block text-[11px] text-white/50 truncate">
                        {formatDriveBytes(file.size_bytes)} · {formatDriveDate(file.created_at)}
                        {folderId === null && file.folder ? ` · ${file.folder.name}` : ''}
                      </span>
                      {expiry && <span className="block text-[11px] text-amber-300 mt-0.5">{expiry}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {pagination && pagination.last_page > 1 && (
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              disabled={page <= 1 || files.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-4 py-2 rounded-full bg-white/10 font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-white/50">
              Page {pagination.current_page} of {pagination.last_page}
            </span>
            <button
              type="button"
              disabled={page >= pagination.last_page || files.isFetching}
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 rounded-full bg-white/10 font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {activeId != null && (
        <DrivePreviewSheet
          key={activeId}
          fileId={activeId}
          initialFile={activeFile}
          loadMembers={loadMembers}
          onClose={closePreview}
        />
      )}
    </div>
  );
}
