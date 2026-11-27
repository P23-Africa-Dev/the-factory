"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import { useCreateLead, useUpdateLead, useApplyLeadMerge, useCrmAssignees, useCrmLabels, useLeadDuplicateSuggestions, usePreviewLeadMerge, useCrmPipelines, useCrmPreferences, useLeadFields } from "@/hooks/use-crm";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import type { ApiLeadStatus, ApiLeadPriority, ApiRoleBasePath, CreateLeadPayload, LeadApiItem, LeadContact, LeadCustomFields, LeadDuplicateField, LeadDuplicateMatch, LeadMergePreview } from "@/lib/api/crm";
import type { ApiRequestError } from "@/lib/api/onboarding";
import { LeadContactsSlider, type LeadContactErrors } from "@/components/crm/lead-contacts";
import { LeadDuplicateNotice, LeadDuplicateSuggestions, LeadMergeDialog } from "@/components/crm/lead-duplicate-suggestions";
import { isValidUrl, normalizeWebsite, parseProfileUrls } from "@/lib/crm/lead-fields";
import {
  formValuesFromLead,
  serializeCustomFields,
  validateCustomFieldValues,
  visibleLeadFieldsForCreate,
  visibleLeadFieldsForDetail,
} from "@/lib/crm/custom-fields";
import { LeadCustomFieldsEditor } from "@/components/crm/lead-custom-fields-editor";
import { LeadFieldDialog } from "@/components/crm/lead-field-dialog";
import { FieldRequestsBanner } from "@/components/crm/field-requests-review";
import { IndustryCombobox } from "@/components/crm/industry-combobox";
import { ModalPortal } from "@/components/ui/modal-portal";
import { resolveCrmPipelineId } from "@/lib/crm/resolve-pipeline";
import { LEAD_INDUSTRY_MAX_LENGTH } from "@/lib/crm/industries";
import { LEAD_BUDGET_CURRENCIES } from "@/lib/crm/lead-budget";
import { useSavedLocations } from "@/hooks/use-saved-locations";
import { FieldError } from "@/components/ui/field-error";
import { scrollToFirstError } from "@/lib/forms/scroll-to-first-error";

type FormErrors = Partial<{
  pipelineId: string;
  companyName: string;
  companyEmail: string;
  website: string;
  industry: string;
  budget: string;
  source: string;
  status: string;
  priority: string;
  assignedToUserId: string;
  nextAction: string;
  lastInteraction: string;
  lastInteractionAt: string;
  customFields: string;
}>;


const IDENTITY_MATCHES = new Set([
  "name",
  "email",
  "phone",
  "contact_name",
  "contact_email",
  "contact_phone",
]);

function isMergeMatch(match: LeadDuplicateMatch): boolean {
  return match.match_type === "exact" && IDENTITY_MATCHES.has(match.matched_on);
}

function SearchableCurrencySelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { code: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean; triggerHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [mounted] = useState(() => typeof document !== "undefined");

  const selected = options.find((o) => o.code === value);

  const calcPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dropHeight = 290;
    const above = window.innerHeight - rect.bottom < dropHeight && rect.top > dropHeight;
    const dropWidth = 220;
    const left = Math.max(8, Math.min(window.innerWidth - dropWidth - 8, rect.left));
    setPos({ top: rect.top, left, width: dropWidth, above, triggerHeight: rect.height });
  }, []);

  const close = useCallback(() => { setOpen(false); setSearch(""); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !dropdownRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", calcPos, true);
    window.addEventListener("resize", calcPos);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", calcPos, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open, close, calcPos]);

  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 30); }, [open]);

  const q = search.trim().toLowerCase();
  const filtered = options.filter((o) => o.code.toLowerCase().includes(q) || o.label.toLowerCase().includes(q));

  const dropdown = open && pos && mounted
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: pos.above ? undefined : pos.top + pos.triggerHeight + 6,
            bottom: pos.above ? window.innerHeight - pos.top + 6 : undefined,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
          }}
          className="overflow-hidden flex flex-col bg-white border border-gray-200 rounded-2xl shadow-[0px_8px_24px_rgba(0,0,0,0.12)]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search currency..."
              className="flex-1 text-[12px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
            />
          </div>
          <div className="overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200" style={{ height: 240 }}>
            {filtered.length === 0 ? (
              <p className="text-center text-[12px] py-8 text-gray-400">No results</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => { onChange(opt.code); close(); }}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-[12px] text-left transition-colors cursor-pointer ${opt.code === value ? "bg-gray-50 text-[#0B1215] font-semibold" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  <span>{opt.label}</span>
                  {opt.code === value && <Check size={13} className="text-[#0B1215] shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); calcPos(); setOpen(true); setSearch(""); }}
        className="h-full flex items-center gap-1.5 pl-3 pr-2.5 text-[10px] font-light text-[#616263] bg-transparent border-r border-gray-200 outline-none cursor-pointer shrink-0 hover:bg-gray-50 transition-colors"
      >
        <span className="whitespace-nowrap">{selected?.label ?? value}</span>
        <ChevronDown size={12} className={`text-gray-400 transition-transform duration-150 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {dropdown}
    </>
  );
}

const PRIORITY_OPTIONS = [
  { label: "Urgent", value: "urgent" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
] as const;

const CURRENCIES = LEAD_BUDGET_CURRENCIES;


export function AddLeadModal({
  onClose,
  apiBasePath = "/admin",
  defaultStatus = "newly_lead",
  lead,
}: {
  onClose: () => void;
  apiBasePath?: ApiRoleBasePath;
  defaultStatus?: ApiLeadStatus;
  lead?: LeadApiItem;
}) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const isAgentContext = apiBasePath === "/agent";
  const canManageLeads = role === "owner" || role === "admin" || role === "supervisor";

  const [contacts, setContacts] = useState<LeadContact[]>(() =>
    lead?.contacts?.length
      ? lead.contacts.map(({ id, name, email, phone, location, position, profile_urls, sort_order }, index) => ({
          id,
          name,
          email: email ?? "",
          phone: phone ?? "",
          location: location ?? "",
          position: position ?? (index === 0 ? (lead.position ?? "") : ""),
          profile_urls: profile_urls?.length
            ? profile_urls
            : index === 0 && lead.profile_urls?.length
              ? lead.profile_urls
              : [""],
          sort_order,
        }))
      : [{
          name: lead?.name ?? "",
          email: lead?.email ?? "",
          phone: lead?.phone ?? "",
          location: lead?.location ?? "",
          position: lead?.position ?? "",
          profile_urls: lead?.profile_urls?.length ? lead.profile_urls : [""],
          sort_order: 0,
        }],
  );
  const [activeContactIndex, setActiveContactIndex] = useState(0);
  const [contactErrors, setContactErrors] = useState<LeadContactErrors[]>([]);
  const [companyName, setCompanyName] = useState(lead?.company_name ?? "");
  const [companyEmail, setCompanyEmail] = useState(lead?.company_email ?? "");
  const [website, setWebsite] = useState(lead?.website ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const [industry, setIndustry] = useState(lead?.industry ?? "");
  const { data: pipelines = [] } = useCrmPipelines(companyId ?? undefined, apiBasePath);
  const { data: labels = [] } = useCrmLabels(companyId ?? undefined, apiBasePath);
  const { data: leadFields = [] } = useLeadFields(companyId ?? undefined, apiBasePath);
  const { data: preferences } = useCrmPreferences(companyId ?? undefined, apiBasePath);

  const resolvedCreatePipelineId = resolveCrmPipelineId(
    pipelines,
    preferences?.preferred_pipeline_id,
    preferences?.company_default_pipeline_id,
  );

  const initialPipelineId = lead?.pipeline_id != null
    ? String(lead.pipeline_id)
    : resolvedCreatePipelineId != null
      ? String(resolvedCreatePipelineId)
      : "";
  const [pipelineId, setPipelineId] = useState("");
  const effectivePipelineId =
    pipelineId ||
    initialPipelineId ||
    (pipelines.length > 0 ? String(pipelines[0].id) : "");

  const [status, setStatus] = useState<ApiLeadStatus>(lead?.status ?? defaultStatus);
  const [priority, setPriority] = useState<ApiLeadPriority>(lead?.priority ?? "medium");
  const [assignedToUserId, setAssignedToUserId] = useState(
    lead
      ? lead.assigned_to_user_id
        ? String(lead.assigned_to_user_id)
        : ""
      : canManageLeads && user?.id
        ? String(user.id)
        : "",
  );
  const assigneeTouchedRef = useRef(false);
  const [budgetCurrency, setBudgetCurrency] = useState(() =>
    lead?.budget_currency ?? lead?.budget?.match(/^([A-Z]{3})/)?.[1] ?? "GBP"
  );
  const [budgetAmount, setBudgetAmount] = useState(() => {
    if (lead?.budget_amount != null) return String(lead.budget_amount);
    return lead?.budget?.replace(/^[A-Z]{3}\s?/, "") ?? "";
  });
  // Map link (edit only): which saved map pin this lead is linked to.
  const [companyLocationId, setCompanyLocationId] = useState(
    lead?.company_location_id != null ? String(lead.company_location_id) : "",
  );
  const { data: savedLocations = [] } = useSavedLocations({ per_page: 100 });
  const mapLocationOptions = useMemo(() => [
    { value: "", label: "Not linked" },
    ...savedLocations.map((location) => ({
      value: String(location.id),
      label: location.address ? `${location.name} · ${location.address}` : location.name,
    })),
    ...(lead?.company_location_id != null
      && !savedLocations.some((location) => location.id === lead.company_location_id)
      ? [{ value: String(lead.company_location_id), label: `Linked location #${lead.company_location_id}` }]
      : []),
  ], [savedLocations, lead?.company_location_id]);
  const [nextAction, setNextAction] = useState(lead?.next_action ?? "");
  const [lastInteraction, setLastInteraction] = useState(lead?.last_interaction ?? "");

  // Format lead?.last_interaction_at as YYYY-MM-DD for the HTML date input
  const initialDate = lead?.last_interaction_at ? lead.last_interaction_at.split("T")[0] : "";
  const [lastInteractionAt, setLastInteractionAt] = useState(initialDate);
  const [customFields, setCustomFields] = useState<LeadCustomFields>({});
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});
  const [showFieldDialog, setShowFieldDialog] = useState(false);
  const [sessionFieldIds, setSessionFieldIds] = useState<number[]>([]);
  const customFieldsSeeded = useRef(false);

  const visibleCustomFields = useMemo(
    () => lead
      ? visibleLeadFieldsForDetail(leadFields, lead.custom_fields, sessionFieldIds)
      : visibleLeadFieldsForCreate(leadFields, sessionFieldIds),
    [lead, leadFields, sessionFieldIds],
  );

  const [errors, setErrors] = useState<FormErrors>({});
  const [suggestField, setSuggestField] = useState<LeadDuplicateField | null>(null);
  const [suggestQuery, setSuggestQuery] = useState("");
  const [debouncedSuggestQuery, setDebouncedSuggestQuery] = useState("");
  const [duplicateMatch, setDuplicateMatch] = useState<LeadDuplicateMatch | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergePreview, setMergePreview] = useState<LeadMergePreview | null>(null);

  // New leads fall back to the first stage. When editing, never silently move a
  // lead whose stage no longer exists: keep it and show it in the list.
  const statusIsKnown = labels.some((label) => label.slug === status);
  const effectiveStatus: ApiLeadStatus =
    !lead && labels.length > 0 && !statusIsKnown ? labels[0].slug : status;
  const statusOptions = [
    ...labels.map((l) => ({ value: l.slug, label: l.name })),
    ...(lead && status && !statusIsKnown
      ? [{ value: status, label: `${String(status).replace(/_/g, " ")} (removed stage)` }]
      : []),
  ];

  const { data: companyUsers = [], isLoading: loadingUsers } = useCrmAssignees(
    canManageLeads ? companyId ?? undefined : undefined,
    apiBasePath,
  );

  useEffect(() => {
    if (lead || isAgentContext || !canManageLeads || !user?.id || assigneeTouchedRef.current) return;
    setAssignedToUserId((current) => current || String(user.id));
  }, [canManageLeads, isAgentContext, lead, user?.id]);

  const createMutation = useCreateLead(
    {
      onSuccess: () => {
        toast.success("Lead created successfully.");
        onClose();
      },
    },
    apiBasePath
  );

  const updateMutation = useUpdateLead(
    {
      onSuccess: () => {
        toast.success("Lead updated successfully.");
        onClose();
      },
    },
    apiBasePath
  );

  const suggestionQuery = useLeadDuplicateSuggestions(
    {
      company_id: companyId ?? undefined,
      q: debouncedSuggestQuery,
      field: suggestField,
      enabled: !lead,
    },
    apiBasePath,
  );

  const previewMerge = usePreviewLeadMerge(apiBasePath);
  const applyMerge = useApplyLeadMerge(
    {
      onSuccess: () => {
        toast.success("Lead merged successfully.");
        onClose();
      },
    },
    apiBasePath,
  );

  useEffect(() => {
    if (leadFields.length === 0) return;
    setCustomFields((current) => {
      const base = formValuesFromLead(leadFields, lead?.custom_fields);
      if (!customFieldsSeeded.current) {
        customFieldsSeeded.current = true;
        return base;
      }
      const next = { ...base };
      Object.entries(current).forEach(([key, value]) => {
        if (key in next) next[key] = value;
      });
      return next;
    });
  }, [lead, leadFields]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSuggestQuery(suggestQuery), 250);
    return () => window.clearTimeout(timer);
  }, [suggestQuery]);

  const suggestionsReady = debouncedSuggestQuery.trim() === suggestQuery.trim();
  const suggestionMatches = !lead && suggestionsReady ? (suggestionQuery.data ?? []) : [];

  useEffect(() => {
    if (lead || !suggestionsReady) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Clear stale duplicate results while a new remote suggestion query is pending.
      setDuplicateMatch(null);
      return;
    }
    const next = (suggestionQuery.data ?? []).find(isMergeMatch) ?? null;
    setDuplicateMatch((current) => (
      current?.id === next?.id
        && current?.match_type === next?.match_type
        && current?.matched_on === next?.matched_on
        ? current
        : next
    ));
  }, [lead, suggestionsReady, suggestionQuery.data]);

  const clearError = (field: keyof FormErrors) =>
    setErrors((prev) => ({ ...prev, [field]: undefined }));

  const updateContact = (index: number, contact: LeadContact) => {
    setContacts((current) => current.map((item, itemIndex) => itemIndex === index ? contact : item));
    setContactErrors((current) => current.map((item, itemIndex) => itemIndex === index ? {} : item));
  };

  const addContact = () => {
    setContacts((current) => [
      ...current,
      { name: "", email: "", phone: "", location: "", position: "", profile_urls: [""], sort_order: current.length },
    ]);
    setActiveContactIndex(contacts.length);
  };

  const removeContact = (index: number) => {
    setContacts((current) => current
      .filter((_, itemIndex) => itemIndex !== index)
      .map((contact, sortOrder) => ({ ...contact, sort_order: sortOrder })));
    setContactErrors((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setActiveContactIndex((current) => Math.max(0, Math.min(current, contacts.length - 2)));
  };

  const validate = (): { fields: FormErrors; contacts: LeadContactErrors[] } => {
    const e: FormErrors = {};
    const contactValidation = contacts.map<LeadContactErrors>((contact) => {
      const errorsForContact: LeadContactErrors = {};
      if (!contact.name.trim()) errorsForContact.name = "Name is required.";
      if (contact.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
        errorsForContact.email = "Enter a valid email address.";
      }
      if (parseProfileUrls(contact.profile_urls ?? []).some((url) => !isValidUrl(url))) {
        errorsForContact.profileUrls = "One or more profile URLs are invalid.";
      }
      return errorsForContact;
    });
    if (!effectivePipelineId) e.pipelineId = "Pipeline is required.";
    if (companyEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
      e.companyEmail = "Enter a valid company email address.";
    }
    if (website.trim() && !isValidUrl(website)) {
      e.website = "Enter a valid website URL.";
    }
    if (industry.trim().length > LEAD_INDUSTRY_MAX_LENGTH) {
      e.industry = `Industry must be ${LEAD_INDUSTRY_MAX_LENGTH} characters or fewer.`;
    }
    if (budgetAmount.trim() && (isNaN(Number(budgetAmount.replace(/,/g, ""))) || Number(budgetAmount.replace(/,/g, "")) < 0)) {
      e.budget = "Enter a valid budget amount.";
    }
    const nextCustomErrors = validateCustomFieldValues(visibleCustomFields, customFields);
    setCustomFieldErrors(nextCustomErrors);
    if (Object.keys(nextCustomErrors).length > 0) {
      e.customFields = "Check the custom fields.";
    }
    return { fields: e, contacts: contactValidation };
  };

  const handleError = (err: unknown) => {
    const apiErr = err as ApiRequestError;
    const msg = apiErr.message ?? "Something went wrong. Please try again.";
    toast.error(msg);
    if (apiErr.errors) {
      const fe: FormErrors = {};
      const ce: LeadContactErrors[] = contacts.map(() => ({}));
      if (apiErr.errors.name) ce[0].name = apiErr.errors.name[0];
      if (apiErr.errors.pipeline_id) fe.pipelineId = apiErr.errors.pipeline_id[0];
      if (apiErr.errors.email) ce[0].email = apiErr.errors.email[0];
      if (apiErr.errors.phone) ce[0].phone = apiErr.errors.phone[0];
      if (apiErr.errors.location) ce[0].location = apiErr.errors.location[0];
      Object.entries(apiErr.errors).forEach(([key, messages]) => {
        const match = key.match(/^contacts\.(\d+)\.(name|email|phone|location|position|profile_urls)$/);
        if (!match) return;
        const index = Number(match[1]);
        ce[index] ??= {};
        const field = match[2] === "profile_urls" ? "profileUrls" : match[2];
        ce[index][field as keyof LeadContactErrors] = messages[0];
      });
      if (apiErr.errors.company_name) fe.companyName = apiErr.errors.company_name[0];
      if (apiErr.errors.company_email) fe.companyEmail = apiErr.errors.company_email[0];
      if (apiErr.errors.website) fe.website = apiErr.errors.website[0];
      if (apiErr.errors.industry) fe.industry = apiErr.errors.industry[0];
      if (apiErr.errors.budget_amount) fe.budget = apiErr.errors.budget_amount[0];
      else if (apiErr.errors.budget_currency) fe.budget = apiErr.errors.budget_currency[0];
      const apiCustomErrors: Record<string, string> = {};
      Object.entries(apiErr.errors).forEach(([key, messages]) => {
        const match = key.match(/^custom_fields\.(.+)$/);
        if (match && messages?.[0]) apiCustomErrors[match[1]] = messages[0];
      });
      if (Object.keys(apiCustomErrors).length > 0) {
        setCustomFieldErrors(apiCustomErrors);
        fe.customFields = "Check the custom fields.";
      }
      if (apiErr.errors.source) fe.source = apiErr.errors.source[0];
      if (apiErr.errors.status) fe.status = apiErr.errors.status[0];
      if (apiErr.errors.priority) fe.priority = apiErr.errors.priority[0];
      if (apiErr.errors.assigned_to_user_id) fe.assignedToUserId = apiErr.errors.assigned_to_user_id[0];
      if (apiErr.errors.next_action) fe.nextAction = apiErr.errors.next_action[0];
      if (apiErr.errors.last_interaction) fe.lastInteraction = apiErr.errors.last_interaction[0];
      if (apiErr.errors.last_interaction_at) fe.lastInteractionAt = apiErr.errors.last_interaction_at[0];
      setErrors(fe);
      setContactErrors(ce);
      const firstContactError = ce.findIndex((contactError) => Object.keys(contactError).length > 0);
      if (firstContactError >= 0) setActiveContactIndex(firstContactError);
      void scrollToFirstError();
    }
  };

  const buildPayload = (): CreateLeadPayload | null => {
    const validation = validate();
    const firstContactError = validation.contacts.findIndex(
      (contactError) => Object.keys(contactError).length > 0,
    );
    if (Object.keys(validation.fields).length > 0 || firstContactError >= 0) {
      setErrors(validation.fields);
      setContactErrors(validation.contacts);
      if (firstContactError >= 0) setActiveContactIndex(firstContactError);
      // Take the user to the first problem (switching contact tab first if needed).
      void scrollToFirstError();
      return null;
    }

    if (!companyId) {
      toast.error("No active company found. Please refresh and try again.");
      return null;
    }

    const normalizedContacts = contacts.map((contact, index) => {
      const contactProfileUrls = parseProfileUrls(contact.profile_urls ?? []);
      return {
        name: contact.name.trim(),
        email: contact.email?.trim() || null,
        phone: contact.phone?.trim() || null,
        location: contact.location?.trim() || null,
        position: contact.position?.trim() || null,
        profile_urls: contactProfileUrls.length > 0 ? contactProfileUrls : null,
        sort_order: index,
      };
    });
    const primaryContact = normalizedContacts[0];
    const resolvedLeadName = companyName.trim() || primaryContact.name;

    return {
      company_id: companyId,
      pipeline_id: Number(effectivePipelineId),
      name: resolvedLeadName,
      email: primaryContact.email,
      phone: primaryContact.phone,
      budget_amount: budgetAmount.trim() ? Number(budgetAmount.replace(/,/g, "")) : null,
      budget_currency: budgetAmount.trim() ? budgetCurrency : null,
      location: primaryContact.location,
      contacts: normalizedContacts,
      company_name: companyName.trim() || null,
      company_email: companyEmail.trim() || null,
      website: website.trim() ? normalizeWebsite(website) : null,
      position: primaryContact.position,
      industry: industry.trim() || null,
      profile_urls: primaryContact.profile_urls,
      source: source.trim() || (isAgentContext ? "agent_upload" : null),
      status: effectiveStatus,
      priority,
      assigned_to_user_id: isAgentContext
        ? null
        : (assignedToUserId ? Number(assignedToUserId) : (lead ? null : (user?.id ?? null))),
      next_action: nextAction.trim() || null,
      last_interaction: lastInteraction.trim() || null,
      last_interaction_at: lastInteractionAt || null,
      custom_fields: serializeCustomFields(visibleCustomFields, customFields),
    };
  };

  const trackSuggest = (field: LeadDuplicateField, value: string) => {
    if (lead) return;
    setSuggestField(field);
    setSuggestQuery(value);
  };

  const selectSuggestion = (match: LeadDuplicateMatch) => {
    if (isMergeMatch(match)) setDuplicateMatch(match);
  };

  const openMerge = () => {
    if (!duplicateMatch) return;
    const payload = buildPayload();
    if (!payload) return;
    setMergePreview(null);
    setMergeOpen(true);
    previewMerge.mutate(
      { leadId: duplicateMatch.id, payload },
      {
        onSuccess: (res) => setMergePreview(res.data),
        onError: handleError,
      },
    );
  };

  const confirmMerge = () => {
    if (!duplicateMatch) return;
    const payload = buildPayload();
    if (!payload) return;
    applyMerge.mutate(
      { leadId: duplicateMatch.id, payload },
      { onError: handleError },
    );
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) return;

    if (lead) {
      // Agents edit every field managers can except the assignee (the API
      // rejects an agent reassigning a lead), so leave it out for them.
      const { assigned_to_user_id: assignee, ...rest } = payload;
      const updatePayload = {
        ...rest,
        ...(isAgentContext ? {} : { assigned_to_user_id: assignee }),
        company_location_id: companyLocationId ? Number(companyLocationId) : null,
      };
      updateMutation.mutate({
        leadId: lead.id,
        payload: updatePayload,
      }, {
        onError: handleError,
      });
    } else {
      createMutation.mutate(payload, {
        onError: handleError,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending || applyMerge.isPending;

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-end justify-center sm:justify-end p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 cursor-pointer"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-t-[28px] sm:rounded-[28px] w-full sm:w-[440px] shadow-[0px_8px_32px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[calc(100vh-80px)] transition-all duration-300 ease-out">
        <div className="bg-transparent h-18 relative overflow-hidden flex items-center px-7 shrink-0">
          <div className="absolute top-0 right-0 w-[50%] h-full pointer-events-none">
            <svg
              viewBox="0 0 200 72"
              fill="none"
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <path
                d="M0 0 C60 24, 20 48, 190 72 L200 92 L200 0 Z"
                fill="#09232D"
              />
            </svg>
          </div>
          <h2 className="text-[18px] font-bold text-dash-dark relative z-10 leading-tight">
            {lead ? (
              <>
                Update Appropriate
                <br />
                Lead Details
              </>
            ) : (
              <>
                Enter Appropriate
                <br />
                Lead Details
              </>
            )}
          </h2>
          <button
            onClick={onClose}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form
          id="add-lead-form"
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto px-7 pb-6"
        >
          <LeadContactsSlider
            contacts={contacts}
            activeIndex={activeContactIndex}
            errors={contactErrors}
            suggestions={lead ? undefined : { field: suggestField, matches: suggestionMatches }}
            onActiveIndexChange={setActiveContactIndex}
            onChange={updateContact}
            onAdd={addContact}
            onRemove={removeContact}
            onIdentityInput={trackSuggest}
            onSelectSuggestion={selectSuggestion}
          />

          {!lead && duplicateMatch && (
            <LeadDuplicateNotice
              match={duplicateMatch}
              onMerge={openMerge}
              onSaveAsNew={() => undefined}
            />
          )}

          <div className="space-y-4 mb-5">
            <SectionDivider
              label={lead ? "Edit Company Details" : "Company Details"}
              subtitle="All fields in this section are optional."
            />

            <div>
              <FormRow label="Company Name" labelClassName="w-28">
                <InlineInput
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    clearError("companyName");
                    trackSuggest("company_name", e.target.value);
                  }}
                  placeholder="E.g Acme Ltd"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.companyName} />
              {!lead && suggestField === "company_name" && (
                <LeadDuplicateSuggestions matches={suggestionMatches} onSelect={selectSuggestion} />
              )}
            </div>

            <div>
              <FormRow label="Company Email" labelClassName="w-28">
                <InlineInput
                  type="email"
                  value={companyEmail}
                  onChange={(e) => {
                    setCompanyEmail(e.target.value);
                    clearError("companyEmail");
                    trackSuggest("company_email", e.target.value);
                  }}
                  placeholder="E.g hello@company.com"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.companyEmail} />
              {!lead && suggestField === "company_email" && (
                <LeadDuplicateSuggestions matches={suggestionMatches} onSelect={selectSuggestion} />
              )}
            </div>

            <div>
              <FormRow label="Website" labelClassName="w-28">
                <InlineInput
                  value={website}
                  onChange={(e) => { setWebsite(e.target.value); clearError("website"); }}
                  placeholder="https://company.com"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.website} />
            </div>
          </div>

          <div className="space-y-4 mb-5">
            <SectionDivider label={lead ? "Edit Lead Classification" : "Lead Classification"} />

            <div>
              <FormRow label="Pipeline *" labelClassName="w-28">
                <InlineSelect
                  value={effectivePipelineId}
                  onChange={(v) => { setPipelineId(v); clearError("pipelineId"); }}
                  options={[{ value: "", label: "Select Pipeline" }, ...pipelines.map((p) => ({ value: String(p.id), label: p.name }))]}
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.pipelineId} />
            </div>

            <div>
              <FormRow label="Source" labelClassName="w-28">
                <InlineInput
                  value={source}
                  onChange={(e) => { setSource(e.target.value); clearError("source"); }}
                  placeholder="E.g Website, Referral"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.source} />
            </div>

            <div>
              <FormRow label="Industry" labelClassName="w-28">
                <IndustryCombobox
                  value={industry}
                  maxLength={LEAD_INDUSTRY_MAX_LENGTH}
                  onChange={(value) => { setIndustry(value); clearError("industry"); }}
                  placeholder="Pick or type, e.g Technology & Software"
                  className="col-span-2"
                  aria-invalid={errors.industry ? true : undefined}
                />
              </FormRow>
              <FieldError message={errors.industry} />
            </div>

            <div>
              <FormRow label="Budget" labelClassName="w-28">
                <div className="col-span-2 h-12.25 w-full flex rounded-xl border border-gray-200 overflow-hidden shadow-[0px_1px_3px_1px_#00000026,0px_1px_2px_0px_#0000004D] bg-white focus-within:border-gray-400 transition-colors">
                  <SearchableCurrencySelect
                    value={budgetCurrency}
                    onChange={setBudgetCurrency}
                    options={CURRENCIES as unknown as { code: string; label: string }[]}
                  />
                  <input
                    type="number"
                    min="0"
                    value={budgetAmount}
                    onChange={(e) => { setBudgetAmount(e.target.value); clearError("budget"); }}
                    placeholder="E.g 10,000"
                    className="flex-1 h-full px-3 text-[10px] font-light text-[#616263] placeholder:text-[10px] bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </FormRow>
              <FieldError message={errors.budget} />
            </div>

            <div>
              <FormRow label="Status" labelClassName="w-28">
                <InlineSelect
                  value={effectiveStatus}
                  onChange={(v) => { setStatus(v as ApiLeadStatus); clearError("status"); }}
                  options={statusOptions}
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.status} />
            </div>

            <div>
              <FormRow label="Priority" labelClassName="w-28">
                <InlineSelect
                  value={priority}
                  onChange={(v) => { setPriority(v as ApiLeadPriority); clearError("priority"); }}
                  options={[...PRIORITY_OPTIONS]}
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.priority} />
            </div>

            {canManageLeads && (
            <div>
              <FormRow label="Assignee" labelClassName="w-28">
                <InlineSelect
                  value={assignedToUserId}
                  onChange={(v) => {
                    assigneeTouchedRef.current = true;
                    setAssignedToUserId(v);
                    clearError("assignedToUserId");
                  }}
                  options={[
                    ...(lead ? [{ value: "", label: loadingUsers ? "Loading users…" : "Unassigned" }] : []),
                    ...companyUsers.map((u) => ({ value: String(u.id), label: u.name })),
                  ]}
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.assignedToUserId} />
            </div>
            )}

            {lead && (canManageLeads || isAgentContext) && (
            <div>
              <FormRow label="Map Link" labelClassName="w-28">
                <InlineSelect
                  value={companyLocationId}
                  onChange={setCompanyLocationId}
                  options={mapLocationOptions}
                  className="col-span-2"
                />
              </FormRow>
            </div>
            )}
          </div>

          <div className="space-y-4 mb-5">
            <SectionDivider label={lead ? "Edit Activity & Interactions" : "Activity & Interactions"} />

            <div>
              <FormRow label="Next Action" labelClassName="w-28">
                <InlineInput
                  value={nextAction}
                  onChange={(e) => { setNextAction(e.target.value); clearError("nextAction"); }}
                  placeholder="E.g Send follow up email"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.nextAction} />
            </div>

            <div>
              <FormRow label="Last Interaction" labelClassName="w-28">
                <InlineInput
                  value={lastInteraction}
                  onChange={(e) => { setLastInteraction(e.target.value); clearError("lastInteraction"); }}
                  placeholder="E.g Call to discuss requirements"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.lastInteraction} />
            </div>

            <div>
              <FormRow label="Interaction Date" labelClassName="w-28">
                <InlineInput
                  type="date"
                  value={lastInteractionAt}
                  onChange={(e) => { setLastInteractionAt(e.target.value); clearError("lastInteractionAt"); }}
                  className="col-span-2 text-[11px]"
                />
              </FormRow>
              <FieldError message={errors.lastInteractionAt} />
            </div>
          </div>

          <div className="space-y-4 mb-5">
            <SectionDivider label="Custom fields" subtitle="Add a column when a lead has details this form does not list yet." />
            {canManageLeads && companyId ? (
              <FieldRequestsBanner
                fields={leadFields}
                companyId={companyId}
                apiBasePath={apiBasePath}
              />
            ) : null}
            <LeadCustomFieldsEditor
              fields={visibleCustomFields}
              values={customFields}
              errors={customFieldErrors}
              agentNotice={isAgentContext}
              onChange={(key, value) => {
                setCustomFields((current) => ({ ...current, [key]: value }));
                setCustomFieldErrors((current) => ({ ...current, [key]: "" }));
              }}
              onAddField={() => setShowFieldDialog(true)}
            />
          </div>

          <div className="flex items-center justify-start mt-6">
            <button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto px-9.25 py-3 sm:py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? "Saving…" : lead ? "Save Changes" : "Done"}
            </button>
          </div>
        </form>
      </div>
      {showFieldDialog && companyId && (
        <LeadFieldDialog
          companyId={companyId}
          apiBasePath={apiBasePath}
          canManage={canManageLeads}
          isAgentContext={isAgentContext}
          onClose={() => setShowFieldDialog(false)}
          onCreated={(field) => {
            setSessionFieldIds((current) => current.includes(field.id) ? current : [...current, field.id]);
            setCustomFields((current) => ({
              ...current,
              [field.key]: field.type === "checkbox" ? false : field.type === "multi_select" ? [] : "",
            }));
            setShowFieldDialog(false);
          }}
        />
      )}
      {mergeOpen && duplicateMatch && (
        <LeadMergeDialog
          preview={mergePreview}
          isLoading={previewMerge.isPending}
          isSaving={applyMerge.isPending}
          onClose={() => setMergeOpen(false)}
          onConfirm={confirmMerge}
        />
      )}
    </div>
    </ModalPortal>
  );
}
