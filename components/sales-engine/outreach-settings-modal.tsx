"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useAuthenticateOutreachDomain,
  useOutreachDomain,
  useResetOutreachDomain,
  useVerifyOutreachDomain,
} from "@/hooks/use-sales-engine-outreach-domain";
import {
  useOutreachSenderSettings,
  useUpdateOutreachSenderSettings,
} from "@/hooks/use-sales-engine-outreach-sender";
import { getApiErrorMessage } from "@/lib/api/errors";
import type { OutreachDnsRecord } from "@/lib/api/sales-engine";

export type OutreachSettingsModalProps = {
  open: boolean;
  onClose: () => void;
};

function connectionLabel(status: string | undefined): string {
  switch (status) {
    case "verified":
      return "Org email verified";
    case "failed":
      return "Org DNS not detected";
    case "pending":
      return "Org DNS pending";
    default:
      return "Org email not connected";
  }
}

function DnsRecordRow({ record }: { record: OutreachDnsRecord }) {
  const [copiedField, setCopiedField] = useState<"host" | "data" | null>(null);

  const copy = async (field: "host" | "data", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 1500);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  return (
    <div className="rounded-[12px] border border-[#e8e8e8] bg-[#fafafa] p-3 text-[11px] text-[#09232d]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wide text-[#9d9d9d]">
          {record.type.toUpperCase()} record
        </span>
        {record.valid && (
          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[#087652]">
            <Check size={11} /> Detected
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="w-10 shrink-0 text-[#9d9d9d]">Host</span>
        <code className="flex-1 truncate rounded-[8px] bg-white px-2 py-1 text-[#09232d] shadow-[inset_0_0_0_1px_#ececec]">
          {record.host}
        </code>
        <button
          type="button"
          onClick={() => copy("host", record.host)}
          className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[#616263] transition hover:bg-[#f0f0f0]"
          aria-label="Copy host"
        >
          {copiedField === "host" ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="w-10 shrink-0 text-[#9d9d9d]">Value</span>
        <code className="flex-1 truncate rounded-[8px] bg-white px-2 py-1 text-[#09232d] shadow-[inset_0_0_0_1px_#ececec]">
          {record.data}
        </code>
        <button
          type="button"
          onClick={() => copy("data", record.data)}
          className="grid size-7 shrink-0 place-items-center rounded-[8px] text-[#616263] transition hover:bg-[#f0f0f0]"
          aria-label="Copy value"
        >
          {copiedField === "data" ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
    </div>
  );
}

export function OutreachSettingsModal({ open, onClose }: OutreachSettingsModalProps) {
  const { data: senderSettings, isLoading: senderLoading } = useOutreachSenderSettings(open);
  const { data: domainAuth, isLoading: domainLoading } = useOutreachDomain(open);
  const updateSender = useUpdateOutreachSenderSettings();
  const authenticate = useAuthenticateOutreachDomain();
  const verify = useVerifyOutreachDomain();
  const reset = useResetOutreachDomain();

  const [senderMode, setSenderMode] = useState<"platform" | "organization">("platform");
  const [domain, setDomain] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [showOrgSetup, setShowOrgSetup] = useState(false);

  const connectionStatus =
    senderSettings?.org_connection_status ??
    (domainAuth
      ? domainAuth.verification_status === "verified"
        ? "verified"
        : domainAuth.verification_status === "failed"
          ? "failed"
          : "pending"
      : "not_connected");

  const orgVerified = connectionStatus === "verified";
  const isLoading = senderLoading || domainLoading;

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate sender form when modal opens */
    setSenderMode(senderSettings?.sender_mode ?? "platform");
    setShowOrgSetup(
      (senderSettings?.sender_mode === "organization" && !orgVerified) ||
        connectionStatus === "pending" ||
        connectionStatus === "failed"
    );
    if (domainAuth?.domain) setDomain(domainAuth.domain);
    if (domainAuth?.from_email) setFromEmail(domainAuth.from_email);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, senderSettings, domainAuth, orgVerified, connectionStatus]);

  const activeFrom = useMemo(() => {
    if (senderMode === "organization" && orgVerified && senderSettings?.org_verified_from_email) {
      return senderSettings.org_verified_from_email;
    }
    return senderSettings?.platform_from_email || "The Factory platform email";
  }, [senderMode, orgVerified, senderSettings]);

  const handleSelectPlatform = async () => {
    setSenderMode("platform");
    setShowOrgSetup(false);
    try {
      await updateSender.mutateAsync({ sender_mode: "platform" });
      toast.success("Sending with The Factory email.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update sender settings."));
    }
  };

  const handleSelectOrganization = () => {
    setSenderMode("organization");
    if (!orgVerified) {
      setShowOrgSetup(true);
      return;
    }
    updateSender.mutate(
      { sender_mode: "organization" },
      {
        onSuccess: () => toast.success("Sending with your organization email."),
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not update sender settings.")),
      }
    );
  };

  const handleAuthenticate = () => {
    authenticate.mutate(
      { domain: domain.trim(), from_email: fromEmail.trim() },
      {
        onSuccess: () => {
          setShowOrgSetup(true);
          toast.success("DNS records generated — add them at your DNS host.");
        },
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not start domain authentication.")),
      }
    );
  };

  const handleVerify = () => {
    verify.mutate(undefined, {
      onSuccess: async (result) => {
        if (result?.verification_status === "verified") {
          try {
            await updateSender.mutateAsync({ sender_mode: "organization" });
            setSenderMode("organization");
            setShowOrgSetup(false);
            toast.success("Domain verified! You can now send as your organization.");
          } catch (error) {
            toast.error(getApiErrorMessage(error, "Domain verified, but could not switch sender mode."));
          }
          return;
        }
        toast("DNS not detected yet — this can take up to 48 hours.");
      },
      onError: (error) => toast.error(getApiErrorMessage(error, "Could not verify domain.")),
    });
  };

  const handleReset = () => {
    reset.mutate(undefined, {
      onSuccess: async () => {
        setDomain("");
        setFromEmail("");
        setShowOrgSetup(true);
        setSenderMode("platform");
        try {
          await updateSender.mutateAsync({ sender_mode: "platform" });
        } catch {
          // ignore — domain already cleared
        }
        toast.success("Domain removed. You can connect a different one.");
      },
      onError: (error) => toast.error(getApiErrorMessage(error, "Could not remove domain.")),
    });
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/55 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", duration: 0.32 }}
            role="dialog"
            aria-modal="true"
            aria-label="Outreach email settings"
            className="relative z-10 flex max-h-[90vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[24px] border border-[#e8e8e8] bg-white text-[#09232d] shadow-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#ececec] px-5 py-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#9d9d9d]">
                  Outreach
                </p>
                <h3 className="mt-0.5 text-[16px] font-semibold">Email settings</h3>
                <p className="mt-1 text-[11px] text-[#616263]">
                  Choose how outreach emails are sent from Sales Engine.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-8 place-items-center rounded-full text-[#616263] transition hover:bg-[#f3f3f3]"
                aria-label="Close email settings"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-[13px] text-[#616263]">
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Loading email settings…
                </div>
              ) : (
                <>
                  <section className="rounded-[16px] border border-[#ececec] bg-[#fafafa] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold">How you send</p>
                      <span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#616263] shadow-[inset_0_0_0_1px_#ececec]">
                        {connectionLabel(connectionStatus)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#616263]">
                      Current From: <span className="font-medium text-[#09232d]">{activeFrom}</span>
                    </p>

                    <div className="mt-3 space-y-2">
                      <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-[#e8e8e8] bg-white px-3 py-2.5">
                        <input
                          type="radio"
                          name="outreach-sender-mode"
                          checked={senderMode === "platform"}
                          onChange={handleSelectPlatform}
                          className="mt-0.5 accent-[#09232d]"
                        />
                        <span>
                          <span className="block text-[12px] font-semibold">
                            Send using The Factory
                          </span>
                          <span className="mt-0.5 block text-[10px] text-[#616263]">
                            (Recommended) uses the platform sending domain. Reply-To stays your email.
                          </span>
                        </span>
                      </label>

                      <label className="flex cursor-pointer items-start gap-2.5 rounded-[12px] border border-[#e8e8e8] bg-white px-3 py-2.5">
                        <input
                          type="radio"
                          name="outreach-sender-mode"
                          checked={senderMode === "organization" || showOrgSetup}
                          onChange={handleSelectOrganization}
                          className="mt-0.5 accent-[#09232d]"
                        />
                        <span>
                          <span className="block text-[12px] font-semibold">
                            Send using my organization email
                          </span>
                          <span className="mt-0.5 block text-[10px] text-[#616263]">
                            Connect and verify your domain so messages appear From your company address.
                          </span>
                        </span>
                      </label>
                    </div>
                  </section>

                  {(showOrgSetup || senderMode === "organization" || connectionStatus !== "not_connected") && (
                    <section className="rounded-[16px] border border-[#ececec] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-semibold">Organization domain</p>
                        {domainAuth && (
                          <button
                            type="button"
                            onClick={handleReset}
                            disabled={reset.isPending}
                            className="text-[10px] font-medium text-[#616263] underline underline-offset-2 hover:text-[#09232d] disabled:opacity-50"
                          >
                            Use a different domain
                          </button>
                        )}
                      </div>

                      {orgVerified && domainAuth ? (
                        <p className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-[#cdeee0] bg-[#f0fdf7] px-3 py-2 text-[11px] font-semibold text-[#087652]">
                          <Check size={13} /> Verified — sending as {domainAuth.from_email}
                        </p>
                      ) : !domainAuth ? (
                        <div className="mt-3 space-y-2">
                          <p className="text-[11px] leading-[15px] text-[#616263]">
                            Enter your domain and a from-address on it. We&apos;ll generate DNS records
                            to prove ownership. Email still sends through our platform — only the From
                            domain changes.
                          </p>
                          <input
                            type="text"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            placeholder="yourcompany.com"
                            className="h-9 w-full rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-[12px] outline-none focus:border-[#09232d]/50"
                          />
                          <input
                            type="email"
                            value={fromEmail}
                            onChange={(e) => setFromEmail(e.target.value)}
                            placeholder="sales@yourcompany.com"
                            className="h-9 w-full rounded-[10px] border border-[#d1d1d1] bg-white px-3 text-[12px] outline-none focus:border-[#09232d]/50"
                          />
                          <button
                            type="button"
                            disabled={
                              authenticate.isPending || !domain.trim() || !fromEmail.trim()
                            }
                            onClick={handleAuthenticate}
                            className="h-9 w-full rounded-[10px] bg-[#09232d] text-[11px] font-semibold text-white transition hover:bg-[#0f3340] disabled:opacity-50"
                          >
                            {authenticate.isPending ? "Generating…" : "Generate DNS records"}
                          </button>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          <p className="text-[11px] font-medium text-[#09232d]">{domainAuth.domain}</p>
                          <p className="text-[10px] leading-[14px] text-[#616263]">
                            Add these DNS records at your domain host, then verify. Propagation can
                            take up to 48 hours.
                          </p>
                          {(domainAuth.dns_records ?? []).map((record) => (
                            <DnsRecordRow key={record.label} record={record} />
                          ))}
                          {domainAuth.verification_status === "failed" && (
                            <p className="text-[10px] text-[#b91c1c]">
                              DNS records weren&apos;t detected yet — double-check them at your DNS
                              host and try again.
                            </p>
                          )}
                          <button
                            type="button"
                            disabled={verify.isPending}
                            onClick={handleVerify}
                            className="h-9 w-full rounded-[10px] bg-[#09232d] text-[11px] font-semibold text-white transition hover:bg-[#0f3340] disabled:opacity-50"
                          >
                            {verify.isPending ? "Checking…" : "I've added these records — Verify"}
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>

            <div className="flex shrink-0 justify-end border-t border-[#ececec] bg-[#f7f7f7] px-5 py-3.5">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-[10px] bg-[#09232d] px-4 text-[11px] font-semibold text-white transition hover:bg-[#0f3340]"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
