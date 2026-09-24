"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function MailboxConnectedInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const status = params.get("status");
    const message = params.get("message");
    const provider = params.get("provider");

    if (status === "connected") {
      toast.success(
        provider
          ? `${provider[0].toUpperCase()}${provider.slice(1)} mailbox connected.`
          : "Mailbox connected."
      );
    } else if (status === "error") {
      toast.error(message || "Could not connect mailbox.");
    }

    router.replace("/sales-engine/outreach");
  }, [params, router]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-[#616263]">
      Finishing mailbox connection…
    </div>
  );
}

export default function OutreachMailboxConnectedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[#616263]">
          Finishing mailbox connection…
        </div>
      }
    >
      <MailboxConnectedInner />
    </Suspense>
  );
}
