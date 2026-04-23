"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  previewInvitation,
  completeInternalOnboarding,
  getAvatars,
  type InternalOnboardingCompletePayload,
  type CompleteOnboardingData,
  type InvitationPreviewData,
} from "@/lib/api/internal-users";

// ─── Invitation preview ───────────────────────────────────────────────────────

export function useInvitationPreview(
  invitationId: number | null,
  token: string | null
) {
  return useQuery({
    queryKey: ["invitation-preview", invitationId, token],
    queryFn: (): Promise<{ data: InvitationPreviewData; message: string }> =>
      previewInvitation({ invitation_id: invitationId!, token: token! }).then(
        (res) => ({ data: res.data, message: res.message })
      ),
    enabled: !!invitationId && !!token,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

// ─── Avatars ──────────────────────────────────────────────────────────────────

export function useAvatars(gender: "male" | "female" | null) {
  return useQuery({
    queryKey: ["avatars", gender],
    queryFn: async (): Promise<string[]> => {
      const res = await getAvatars(gender!);
      return res.data;
    },
    enabled: !!gender,
    staleTime: Infinity,
  });
}

// ─── Complete onboarding ──────────────────────────────────────────────────────

export function useCompleteOnboarding(options?: {
  onSuccess?: (data: CompleteOnboardingData) => void;
  onError?: (message: string) => void;
}) {
  return useMutation({
    mutationFn: (payload: InternalOnboardingCompletePayload) =>
      completeInternalOnboarding(payload),
    onSuccess: (res) => {
      options?.onSuccess?.(res.data);
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Onboarding failed. Please try again.";
      options?.onError?.(message);
    },
  });
}
