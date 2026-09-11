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
  return lead.linkedin_url || lead.profile_urls?.[0] || null;
}

export function leadEntityBadge(lead: ChatLead): "Account" | "Contact" {
  return leadEntityType(lead) === "company" ? "Account" : "Contact";
}
