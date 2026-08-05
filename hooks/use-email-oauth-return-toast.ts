"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/**
 * Handles Email Accounts OAuth return query params after redirect/popup fallback.
 */
export function useEmailOAuthReturnToast(onHandled?: () => void) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const status = searchParams.get("email_oauth");
    if (!status) {
      return;
    }

    const message = searchParams.get("message")?.trim() ?? "";
    const provider = searchParams.get("provider")?.trim() ?? "";
    const handledKey = `${status}|${message}|${provider}`;
    if (handledKeyRef.current === handledKey) {
      return;
    }
    handledKeyRef.current = handledKey;

    const displayMessage =
      message ||
      (status === "success"
        ? "Email account connected successfully."
        : "Email account connection failed. Please try again.");

    if (status === "success") {
      toast.success(displayMessage);
    } else {
      toast.error(displayMessage);
    }

    onHandled?.();

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("email_oauth");
    nextParams.delete("message");
    nextParams.delete("provider");
    const query = nextParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, router, pathname, onHandled]);
}
