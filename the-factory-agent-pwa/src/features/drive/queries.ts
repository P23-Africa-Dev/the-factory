import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { driveApi, driveErrorMessage } from './api';
import type { DriveFileFilters, DriveGrantsPayload, DriveMemberLoader } from './types';

export const driveKeys = {
  all: ['drive'] as const,
  usage: (companyId: number | null) => [...driveKeys.all, 'usage', companyId] as const,
  folders: (companyId: number | null) => [...driveKeys.all, 'folders', companyId] as const,
  files: (companyId: number | null, filters: DriveFileFilters) =>
    [...driveKeys.all, 'files', companyId, filters] as const,
  file: (companyId: number | null, fileId: number) => [...driveKeys.all, 'file', companyId, fileId] as const,
  members: (companyId: number | null) => [...driveKeys.all, 'members', companyId] as const,
};

/** 403/404/503 will not fix themselves on a retry. */
function retryUnlessFinal(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 403 || status === 404 || status === 503 || status === 422) return false;
  return failureCount < 2;
}

export function useDriveUsage() {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: driveKeys.usage(companyId),
    queryFn: driveApi.getUsage,
    retry: retryUnlessFinal,
  });
}

export function useDriveFolders() {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: driveKeys.folders(companyId),
    queryFn: driveApi.listFolders,
    retry: retryUnlessFinal,
  });
}

export function useDriveFiles(filters: DriveFileFilters) {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: driveKeys.files(companyId, filters),
    queryFn: () => driveApi.listFiles(filters),
    retry: retryUnlessFinal,
    placeholderData: (previous) => previous,
  });
}

/** A single file, for `?file=` deep links that may not be in the current list. */
export function useDriveFile(fileId: number | null) {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: driveKeys.file(companyId, fileId ?? 0),
    queryFn: () => driveApi.getFile(fileId as number),
    enabled: fileId != null && fileId > 0,
    retry: retryUnlessFinal,
  });
}

/** Company members for the share picker; the manager screen supplies the loader. */
export function useDriveMembers(loadMembers: DriveMemberLoader | undefined) {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: driveKeys.members(companyId),
    queryFn: () => (loadMembers ? loadMembers() : Promise.resolve([])),
    enabled: loadMembers != null,
    staleTime: 1000 * 60 * 5,
  });
}

export function useUploadDriveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: driveApi.upload,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: driveKeys.all });
      toast.success('File uploaded');
    },
    onError: (error) => toast.error('Upload failed', driveErrorMessage(error)),
  });
}

export function useSyncDriveGrants() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { fileId: number } & DriveGrantsPayload) =>
      driveApi.syncGrants(vars.fileId, { share_with_all: vars.share_with_all, user_ids: vars.user_ids }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: driveKeys.all });
      toast.success('Sharing updated');
    },
    onError: (error) => toast.error('Could not update sharing', driveErrorMessage(error)),
  });
}

export function useDeleteDriveFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fileId: number) => driveApi.remove(fileId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: driveKeys.all });
      toast.success('File deleted');
    },
    onError: (error) => toast.error('Could not delete file', driveErrorMessage(error)),
  });
}
