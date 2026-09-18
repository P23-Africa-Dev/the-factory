import type { ChatLead } from "@/lib/api/sales-engine";

export function leadEntityType(lead: ChatLead): "person" | "company" {
  return lead.entity_type === "company" ? "company" : "person";
}

export function formatLeadRoleLine(lead: ChatLead): string | null {
  if (leadEntityType(lead) === "company") {
    const location = (lead.location ?? "").trim();
    return location !== "" ? location : null;
  }

  if (!lead.title && !lead.company) {
    return null;
  }

  return [lead.title, lead.company].filter(Boolean).join(" at ");
}

export function formatLeadContactLine(lead: ChatLead): string | null {
  if (leadEntityType(lead) !== "company") {
    return null;
  }

  const contact = (lead.contact_person ?? "").trim();
  if (!contact) {
    return null;
  }

  return lead.title ? `Contact: ${contact} · ${lead.title}` : `Contact: ${contact}`;
}

export function primaryProfileUrl(lead: ChatLead): string | null {
  const candidates = [
    lead.linkedin_url,
    lead.profile_urls?.[0],
    lead.source_url,
    lead.website,
  ];

  for (const raw of candidates) {
    const normalized = normalizeExternalUrl(raw);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/** Prefer LinkedIn/profile; fall back to discovery source or company website. */
export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (value === "") {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  // Hostnames / bare domains from Serper website fields.
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:].*)?$/i.test(value)) {
    return `https://${value.replace(/^\/+/, "")}`;
  }

  return null;
}

export function leadEntityBadge(lead: ChatLead): "Account" | "Contact" {
  return leadEntityType(lead) === "company" ? "Account" : "Contact";
}
