"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useMapCredits } from "@/hooks/use-map-credits";
import { useMapCreditStore } from "@/store/map-credits";

const MANAGEMENT_ROLES = new Set(["owner", "admin", "supervisor"]);
const TOAST_ID = "map-credit-low";
// Don't nag: at most one prompt per this interval, regardless of how many
// Google calls the user makes.
const THROTTLE_MS = 10 * 60 * 1000;

/**
 * Surfaces a throttled low/exhausted-credit prompt to management users. Driven
 * by both the periodic snapshot poll and the live per-call signal pushed into
 * the map-credit store by the Places client code.
 */
export function LowCreditWatcher() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { role, apiCompanyId: companyId } = getActiveCompanyContext(user);
  const isManagement = role != null && MANAGEMENT_ROLES.has(role);

  const { data } = useMapCredits(companyId ?? undefined, {
    enabled: isManagement,
    refetchInterval: 60_000,
  });

  const signalAt = useMapCreditStore((s) => s.lastEventAt);
  const signalMeta = useMapCreditStore((s) => s.lastMeta);
  const lastPromptAtRef = useRef(0);

  useEffect(() => {
    if (!isManagement) return;

    const metered = data?.metered ?? signalMeta?.metered ?? false;
    if (!metered) return;

    const exhausted = Boolean(data?.exhausted) || Boolean(signalMeta?.blocked);
    const low = Boolean(data?.low) || Boolean(signalMeta?.low) || exhausted;
    if (!low) return;

    const now = Date.now();
    if (now - lastPromptAtRef.current < THROTTLE_MS) return;
    lastPromptAtRef.current = now;

    toast[exhausted ? "error" : "warning"](
      exhausted ? "Map credits exhausted" : "Map credits running low",
      {
        id: TOAST_ID,
        description: exhausted
          ? "Google Maps search & places are paused until you top up. The map still works via the fallback provider."
          : "Top up soon to avoid interruptions to map search and places.",
        duration: Infinity,
        action: {
          label: "Top up",
          onClick: () => router.push("/settings/map-credits"),
        },
        cancel: {
          label: "Later",
          onClick: () => toast.dismiss(TOAST_ID),
        },
      },
    );
  }, [isManagement, data?.low, data?.exhausted, data?.metered, signalAt, signalMeta, router]);

  return null;
}
