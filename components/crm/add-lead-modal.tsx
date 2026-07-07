"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import PhoneNumberInput from "@/components/ui/phone-number-input";
import { useCreateLead, useUpdateLead } from "@/hooks/use-crm";
import { useCrmLabels, useCrmPipelines } from "@/hooks/use-crm";
import { useInternalUsers } from "@/hooks/use-internal-users";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import type { ApiLeadStatus, ApiLeadPriority, ApiRoleBasePath, LeadApiItem } from "@/lib/api/crm";
import type { ApiRequestError } from "@/lib/api/onboarding";
import { ProfileUrlInputs } from "@/components/crm/profile-url-inputs";
import { isValidUrl, normalizeWebsite, parseProfileUrls } from "@/lib/crm/lead-fields";

type FormErrors = Partial<{
  pipelineId: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  companyName: string;
  website: string;
  position: string;
  profileUrls: string;
  source: string;
  status: string;
  priority: string;
  assignedToUserId: string;
  nextAction: string;
  lastInteraction: string;
  lastInteractionAt: string;
}>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red-500 mt-0.5 text-right">{message}</p>;
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
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
] as const;

const CURRENCIES = [
  { code: "USD", label: "USD ($)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "GBP", label: "GBP (£)" },
  { code: "NGN", label: "NGN (₦)" },
  { code: "KES", label: "KES (KSh)" },
  { code: "GHS", label: "GHS (GH₵)" },
  { code: "ZAR", label: "ZAR (R)" },
  { code: "JPY", label: "JPY (¥)" },
  { code: "CAD", label: "CAD (C$)" },
  { code: "AUD", label: "AUD (A$)" },
] as const;


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
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const isAgentContext = apiBasePath === "/agent";

  const [name, setName] = useState(lead?.name ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [location, setLocation] = useState(lead?.location ?? "");
  const [companyName, setCompanyName] = useState(lead?.company_name ?? "");
  const [website, setWebsite] = useState(lead?.website ?? "");
  const [position, setPosition] = useState(lead?.position ?? "");
  const [profileUrls, setProfileUrls] = useState<string[]>(
    lead?.profile_urls?.length ? lead.profile_urls : [""]
  );
  const [source, setSource] = useState(lead?.source ?? "");
  const { data: pipelines = [] } = useCrmPipelines(companyId ?? undefined, apiBasePath);
  const { data: labels = [] } = useCrmLabels(companyId ?? undefined, apiBasePath);

  const defaultPipelineId = lead?.pipeline_id != null
    ? String(lead.pipeline_id)
    : pipelines[0]?.id != null
      ? String(pipelines[0].id)
      : "";
  const [pipelineId, setPipelineId] = useState(defaultPipelineId);

  const [status, setStatus] = useState<ApiLeadStatus>(lead?.status ?? defaultStatus);
  const [priority, setPriority] = useState<ApiLeadPriority>(lead?.priority ?? "medium");
  const [assignedToUserId, setAssignedToUserId] = useState(lead?.assigned_to_user_id ? String(lead.assigned_to_user_id) : "");
  const [budgetCurrency, setBudgetCurrency] = useState(() =>
    lead?.budget_currency ?? lead?.budget?.match(/^([A-Z]{3})/)?.[1] ?? "USD"
  );
  const [budgetAmount, setBudgetAmount] = useState(() => {
    if (lead?.budget_amount != null) return String(lead.budget_amount);
    return lead?.budget?.replace(/^[A-Z]{3}\s?/, "") ?? "";
  });
  const [nextAction, setNextAction] = useState(lead?.next_action ?? "");
  const [lastInteraction, setLastInteraction] = useState(lead?.last_interaction ?? "");

  // Format lead?.last_interaction_at as YYYY-MM-DD for the HTML date input
  const initialDate = lead?.last_interaction_at ? lead.last_interaction_at.split("T")[0] : "";
  const [lastInteractionAt, setLastInteractionAt] = useState(initialDate);

  const [errors, setErrors] = useState<FormErrors>({});

  const effectivePipelineId =
    pipelineId || (pipelines.length > 0 ? String(pipelines[0].id) : "");
  const effectiveStatus: ApiLeadStatus =
    labels.length > 0 && !labels.some((label) => label.slug === status)
      ? labels[0].slug
      : status;

  const { data: companyUsers = [], isLoading: loadingUsers } = useInternalUsers({
    company_id: !isAgentContext ? (companyId ?? undefined) : undefined,
  });

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

  const clearError = (field: keyof FormErrors) =>
    setErrors((prev) => ({ ...prev, [field]: undefined }));

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!effectivePipelineId) e.pipelineId = "Pipeline is required.";
    if (!name.trim()) e.name = "Name is required.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = "Enter a valid email address.";
    }
    if (website.trim() && !isValidUrl(website)) {
      e.website = "Enter a valid website URL.";
    }
    const cleanedProfileUrls = parseProfileUrls(profileUrls);
    if (cleanedProfileUrls.some((url) => !isValidUrl(url))) {
      e.profileUrls = "One or more profile URLs are invalid.";
    }
    return e;
  };

  const handleError = (err: unknown) => {
    const apiErr = err as ApiRequestError;
    const msg = apiErr.message ?? "Something went wrong. Please try again.";
    toast.error(msg);
    if (apiErr.errors) {
      const fe: FormErrors = {};
      if (apiErr.errors.name) fe.name = apiErr.errors.name[0];
      if (apiErr.errors.pipeline_id) fe.pipelineId = apiErr.errors.pipeline_id[0];
      if (apiErr.errors.email) fe.email = apiErr.errors.email[0];
      if (apiErr.errors.phone) fe.phone = apiErr.errors.phone[0];
      if (apiErr.errors.location) fe.location = apiErr.errors.location[0];
      if (apiErr.errors.company_name) fe.companyName = apiErr.errors.company_name[0];
      if (apiErr.errors.website) fe.website = apiErr.errors.website[0];
      if (apiErr.errors.position) fe.position = apiErr.errors.position[0];
      if (apiErr.errors.profile_urls) fe.profileUrls = apiErr.errors.profile_urls[0];
      if (apiErr.errors.source) fe.source = apiErr.errors.source[0];
      if (apiErr.errors.status) fe.status = apiErr.errors.status[0];
      if (apiErr.errors.priority) fe.priority = apiErr.errors.priority[0];
      if (apiErr.errors.assigned_to_user_id) fe.assignedToUserId = apiErr.errors.assigned_to_user_id[0];
      if (apiErr.errors.next_action) fe.nextAction = apiErr.errors.next_action[0];
      if (apiErr.errors.last_interaction) fe.lastInteraction = apiErr.errors.last_interaction[0];
      if (apiErr.errors.last_interaction_at) fe.lastInteractionAt = apiErr.errors.last_interaction_at[0];
      setErrors(fe);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    if (!companyId) {
      toast.error("No active company found. Please refresh and try again.");
      return;
    }

    const cleanedProfileUrls = parseProfileUrls(profileUrls);

    const payload = {
      company_id: companyId,
      pipeline_id: Number(effectivePipelineId),
      name: name.trim(),
      email: email.trim() || null,
      phone: phone || null,
      budget_amount: budgetAmount.trim() ? Number(budgetAmount.replace(/,/g, "")) : null,
      budget_currency: budgetAmount.trim() ? budgetCurrency : null,
      location: location.trim() || null,
      company_name: companyName.trim() || null,
      website: website.trim() ? normalizeWebsite(website) : null,
      position: position.trim() || null,
      profile_urls: cleanedProfileUrls.length > 0 ? cleanedProfileUrls : null,
      source: source.trim() || (isAgentContext ? "agent_upload" : null),
      status,
      priority,
      assigned_to_user_id: isAgentContext ? null : (assignedToUserId ? Number(assignedToUserId) : null),
      next_action: nextAction.trim() || null,
      last_interaction: lastInteraction.trim() || null,
      last_interaction_at: lastInteractionAt || null,
    };

    if (lead) {
      updateMutation.mutate({
        leadId: lead.id,
        payload,
      }, {
        onError: handleError,
      });
    } else {
      createMutation.mutate(payload, {
        onError: handleError,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-end justify-center sm:justify-end p-0 sm:p-6">
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
          <div className="space-y-4 mb-5">
            <SectionDivider label={lead ? "Edit Contact Details" : "Lead Contact Details"} />

            <div>
              <FormRow label="Name *" labelClassName="w-28">
                <InlineInput
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearError("name"); }}
                  placeholder="E.g John Doe"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.name} />
            </div>

            <div>
              <FormRow label="Email" labelClassName="w-28">
                <InlineInput
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                  placeholder="E.g john.doe@example.com"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.email} />
            </div>

            <div>
              <FormRow label="Phone" labelClassName="w-28">
                <div className="col-span-2 w-full">
                  <PhoneNumberInput
                    value={phone}
                    onChange={(val) => { setPhone(val); clearError("phone"); }}
                    placeholder="E.g 555-0199"
                    defaultCountry="GB"
                    variant="compact"
                  />
                </div>
              </FormRow>
              <FieldError message={errors.phone} />
            </div>

            <div>
              <FormRow label="Location" labelClassName="w-28">
                <InlineInput
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); clearError("location"); }}
                  placeholder="E.g New York, USA"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.location} />
            </div>
          </div>

          <div className="space-y-4 mb-5">
            <SectionDivider
              label={lead ? "Edit Company & Professional Details" : "Company & Professional Details"}
              subtitle="All fields in this section are optional."
            />

            <div>
              <FormRow label="Company Name" labelClassName="w-28">
                <InlineInput
                  value={companyName}
                  onChange={(e) => { setCompanyName(e.target.value); clearError("companyName"); }}
                  placeholder="E.g Acme Ltd"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.companyName} />
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

            <div>
              <FormRow label="Position" labelClassName="w-28">
                <InlineInput
                  value={position}
                  onChange={(e) => { setPosition(e.target.value); clearError("position"); }}
                  placeholder="E.g Head of Sales"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.position} />
            </div>

            <ProfileUrlInputs
              values={profileUrls}
              onChange={(values) => {
                setProfileUrls(values);
                clearError("profileUrls");
              }}
              errors={errors.profileUrls ? [errors.profileUrls] : []}
            />
          </div>

          <div className="space-y-4 mb-5">
            <SectionDivider label={lead ? "Edit Lead Classification" : "Lead Classification"} />

            <div>
              <FormRow label="Pipeline *" labelClassName="w-28">
                <InlineSelect
                  value={pipelineId}
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
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="E.g 10,000"
                    className="flex-1 h-full px-3 text-[10px] font-light text-[#616263] placeholder:text-[10px] bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </FormRow>
            </div>

            <div>
              <FormRow label="Status" labelClassName="w-28">
                <InlineSelect
                  value={status}
                  onChange={(v) => { setStatus(v as ApiLeadStatus); clearError("status"); }}
                  options={labels.map((l) => ({ value: l.slug, label: l.name }))}
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

            <div>
              <FormRow label="Assignee" labelClassName="w-28">
                <InlineSelect
                  value={assignedToUserId}
                  onChange={(v) => { setAssignedToUserId(v); clearError("assignedToUserId"); }}
                  options={[{ value: "", label: "Unassigned" }, ...companyUsers.map((u) => ({ value: String(u.id), label: u.name }))]}
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.assignedToUserId} />
            </div>
          </div>

          <div className="space-y-4 mb-5">
            <SectionDivider label={lead ? "Edit Activity & Interactions" : "Activity & Interactions"} />

            <div>
              <FormRow label="Next Action" labelClassName="w-28">
                <InlineInput
                  value={nextAction}
                  onChange={(e) => { setNextAction(e.target.value); clearError("nextAction"); }}
                  placeholder="E.g Send follow-up email"
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
    </div>
  );
}
