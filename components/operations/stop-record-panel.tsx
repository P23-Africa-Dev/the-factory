"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarClock, FileText, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import {
  downloadStopAttachment,
  type FieldStopAttachment,
  type FieldStopDto,
  type JourneyCard,
  type TripAiSummary,
} from "@/lib/api/field-activity";

export const ACTIVITY_LABELS: Record<string, string> = {
  customer_visit: "Customer visit",
  lead_visit: "Lead / prospect visit",
  org_visit: "Company site",
  personal: "Personal / break",
  ignore: "Not a stop",
  pending: "Not recorded",
};

export const OUTCOME_LABELS: Record<string, string> = {
  successful: "Successful",
  follow_up: "Follow-up needed",
  nobody_available: "Nobody available",
  not_interested: "Not interested",
  other: "Other",
};

/** "Submitted" / "Due · 2 of 5 recorded" for a field trip's report. */
export function ReportStatusBadge({ journey }: { journey: Pick<JourneyCard, "report_status" | "records"> }) {
  if (!journey.report_status || journey.report_status === "none") return null;
  const submitted = journey.report_status === "submitted";
  const r = journey.records;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
        submitted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {submitted ? "Report submitted" : "Report due"}
      {!submitted && r && r.total > 0 ? ` · ${r.recorded}/${r.total} recorded` : ""}
    </span>
  );
}

export function TripSummaryPanel({ summary }: { summary: TripAiSummary }) {
  const highlights = summary.highlights ?? [];
  const followUps = summary.follow_ups ?? [];
  const concerns = summary.concerns ?? [];
  return (
    <div className="rounded-xl border border-[#2F5E71]/20 bg-gradient-to-b from-[#EEF4F4] to-white px-3 py-3 space-y-2">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#2F5E71]">
        <Sparkles size={12} /> {summary.source === "ai" ? "AI trip summary" : "Trip summary"}
      </p>
      <p className="text-[12px] leading-relaxed text-[#0B1215]">{summary.summary}</p>
      {highlights.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4">
          {highlights.map((h, i) => (
            <li key={i} className="text-[11px] text-gray-700">
              {h}
            </li>
          ))}
        </ul>
      )}
      {followUps.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Follow-ups</p>
          {followUps.map((f, i) => (
            <p key={i} className="flex items-start gap-1.5 text-[11px] text-gray-700">
              <CalendarClock size={12} className="mt-0.5 shrink-0 text-amber-600" />
              <span>
                <span className="font-bold">{f.who}</span> · {f.what}
                {f.when ? <span className="text-gray-500"> · {f.when}</span> : null}
              </span>
            </p>
          ))}
        </div>
      )}
      {concerns.map((c, i) => (
        <p key={i} className="flex items-start gap-1.5 text-[11px] text-rose-700">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {c}
        </p>
      ))}
    </div>
  );
}

function AttachmentThumb({
  attachment,
  companyId,
  onOpenImage,
}: {
  attachment: FieldStopAttachment;
  companyId?: number | string;
  onOpenImage: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!attachment.is_image) return undefined;
    let objectUrl: string | null = null;
    let cancelled = false;
    void downloadStopAttachment(attachment.id, { company_id: companyId }, getAuthTokenFromDocument() || "")
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id, attachment.is_image, companyId]);

  const openDocument = async () => {
    setBusy(true);
    try {
      const blob = await downloadStopAttachment(attachment.id, { company_id: companyId }, getAuthTokenFromDocument() || "");
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = attachment.original_name ?? "document";
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => (attachment.is_image ? url && onOpenImage(url) : void openDocument())}
      title={attachment.original_name ?? undefined}
      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-[#F8F9FA]"
    >
      {attachment.is_image && url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={attachment.caption ?? "Stop photo"} className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-gray-500">
          {busy || (attachment.is_image && !failed) ? <Loader2 size={14} className="animate-spin" /> : <FileText size={16} />}
          {!attachment.is_image && <span className="w-full truncate text-center text-[8px]">{attachment.original_name ?? "File"}</span>}
          {failed && <span className="text-[8px] text-rose-600">Unavailable</span>}
        </span>
      )}
    </button>
  );
}

export function StopAttachmentsGallery({ attachments, companyId }: { attachments: FieldStopAttachment[]; companyId?: number | string }) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (attachments.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {attachments.map((a) => (
          <AttachmentThumb key={a.id} attachment={a} companyId={companyId} onOpenImage={setLightbox} />
        ))}
      </div>
      {lightbox &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-6"
            role="dialog"
            aria-modal="true"
            onClick={() => setLightbox(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
            <button type="button" aria-label="Close" className="absolute right-5 top-5 rounded-full bg-white/10 p-2 text-white">
              <X size={18} />
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

/** What the person recorded at the selected stop (manager journey view). */
export function StopRecordPanel({ stop, index, companyId }: { stop: FieldStopDto; index: number; companyId?: number | string }) {
  const recorded = stop.record_status === "recorded";
  const activity = ACTIVITY_LABELS[stop.classification ?? "pending"] ?? stop.classification;
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Stop {index + 1}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            recorded ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {recorded ? "Recorded" : "Not recorded"}
        </span>
      </div>
      <p className="text-[12px] font-bold text-[#0B1215]">{stop.lead_name || stop.location_name || stop.address || `Stop ${index + 1}`}</p>
      <div className="flex flex-wrap gap-1">
        {recorded && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">{activity}</span>}
        {stop.outcome && (
          <span className="rounded-full bg-[#EEF4F4] px-2 py-0.5 text-[10px] font-semibold text-[#2F5E71]">
            {OUTCOME_LABELS[stop.outcome] ?? stop.outcome}
          </span>
        )}
        {stop.follow_up_at && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Follow up {stop.follow_up_at}</span>
        )}
        {stop.source === "manual" && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">Added by agent</span>
        )}
        {stop.off_route && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700">Not on recorded route</span>
        )}
      </div>
      {stop.location_status === "corrected" && (
        <div className="rounded-lg bg-[#F8F9FA] px-2 py-1.5 text-[10px] text-gray-600">
          <p className="flex items-start gap-1">
            <MapPin size={11} className="mt-0.5 shrink-0 text-[#F97316]" />
            <span>
              <span className="font-bold">Corrected by agent.</span> Detected at{" "}
              {stop.original_address ||
                (stop.original_latitude != null ? `${Number(stop.original_latitude).toFixed(5)}, ${Number(stop.original_longitude).toFixed(5)}` : "another spot")}
            </span>
          </p>
        </div>
      )}
      {stop.location_status === "confirmed" && <p className="text-[10px] text-gray-500">Place confirmed by agent</p>}
      {stop.notes && <p className="whitespace-pre-line text-[11px] leading-relaxed text-gray-700">{stop.notes}</p>}
      <StopAttachmentsGallery attachments={stop.attachments ?? []} companyId={companyId} />
    </div>
  );
}
