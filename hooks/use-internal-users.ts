"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createInternalUser,
  type CreateInternalUserPayload,
  type CreatedInternalUser,
} from "@/lib/api/internal-users";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export function useCreateInternalUser(options?: {
  onSuccess?: (user: CreatedInternalUser) => void;
}) {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";

  return useMutation({
    mutationFn: (payload: CreateInternalUserPayload) =>
      createInternalUser(payload, token),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["internal-users"] });
      options?.onSuccess?.(res.data.user);
    },
  });
}
