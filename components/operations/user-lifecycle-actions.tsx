"use client";

import { useState } from "react";
import { Loader2, Trash2, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { SuspendUserModal } from "@/components/operations/suspend-user-modal";
import {
  useDeleteInternalUser,
  useReactivateInternalUser,
  useSuspendInternalUser,
} from "@/hooks/use-internal-user-lifecycle";
import { useUserManagementPermissions } from "@/hooks/use-user-management-permissions";

type UserLifecycleActionsProps = {
  userId: number | string;
  userName: string;
  companyId?: number | string;
  internalRole?: string | null;
  supervisorUserId?: number | null;
  isSuspended?: boolean;
  suspendedUntil?: string | null;
  compact?: boolean;
};

export function UserLifecycleActions({
  userId,
  userName,
  companyId,
  internalRole,
  supervisorUserId,
  isSuspended = false,
  suspendedUntil,
  compact = false,
}: UserLifecycleActionsProps) {
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const permissions = useUserManagementPermissions({
    internalRole,
    supervisorUserId,
    isSuspended,
  });

  const suspendMutation = useSuspendInternalUser();
  const reactivateMutation = useReactivateInternalUser();
  const deleteMutation = useDeleteInternalUser();

  if (!companyId) return null;

  const lifecyclePayload = { company_id: companyId };
  const isPending =
    suspendMutation.isPending || reactivateMutation.isPending || deleteMutation.isPending;

  const handleSuspend = (payload: {
    suspend_type: "duration" | "date" | "permanent";
    suspend_days?: number;
    suspend_until?: string;
  }) => {
    suspendMutation.mutate(
      {
        userId,
        payload: { ...payload, company_id: companyId },
      },
      {
        onSuccess: () => {
          toast.success(`${userName} has been suspended.`);
          setShowSuspendModal(false);
        },
        onError: () => toast.error("Unable to suspend this user."),
      },
    );
  };

  const handleReactivate = () => {
    reactivateMutation.mutate(
      { userId, payload: lifecyclePayload },
      {
        onSuccess: () => toast.success(`${userName} has been reactivated.`),
        onError: () => toast.error("Unable to reactivate this user."),
      },
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(
      { userId, payload: lifecyclePayload },
      {
        onSuccess: () => {
          toast.success(`${userName} has been deleted.`);
          setShowDeleteConfirm(false);
        },
        onError: () => toast.error("Unable to delete this user."),
      },
    );
  };

  if (
    !permissions.canSuspend &&
    !permissions.canDelete &&
    !permissions.canReactivate &&
    !isSuspended
  ) {
    return null;
  }

  return (
    <>
      <div className={`${compact ? "flex flex-wrap gap-2" : "mt-4 space-y-3"}`}>
        {isSuspended && (
          <p className={`text-xs text-amber-700 ${compact ? "w-full" : ""}`}>
            Suspended{suspendedUntil ? ` until ${new Date(suspendedUntil).toLocaleDateString()}` : ""}
          </p>
        )}

        <div className={`flex flex-wrap gap-2 ${compact ? "" : ""}`}>
          {permissions.canReactivate && (
            <button
              type="button"
              onClick={handleReactivate}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
            >
              {reactivateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserCheck size={14} />
              )}
              Reactivate
            </button>
          )}

          {permissions.canSuspend && (
            <button
              type="button"
              onClick={() => setShowSuspendModal(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700"
            >
              <UserX size={14} />
              Suspend
            </button>
          )}

          {permissions.canDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
        </div>
      </div>

      <SuspendUserModal
        open={showSuspendModal}
        userName={userName}
        isSubmitting={suspendMutation.isPending}
        onClose={() => setShowSuspendModal(false)}
        onConfirm={handleSuspend}
      />

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-dash-dark">Delete user</h3>
            <p className="mt-2 text-sm text-gray-500">
              This will remove <strong>{userName}</strong> from your organization. This action can be reversed by support if needed.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Delete user"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
