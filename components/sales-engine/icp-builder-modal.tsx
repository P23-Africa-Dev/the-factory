"use client";

import { useState } from "react";
import {
  X,
  Sparkles,
  Building2,
  Users,
  MapPin,
  Target,
  Sliders,
  Check,
  Plus,
  ArrowRight,
  Briefcase,
  ArrowLeft,
  Edit2,
  Trash2,
  Copy,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { Toggle } from "@/components/ui/toggle";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  useActivateIcpProfile,
  useCreateIcpProfile,
  useDeleteIcpProfile,
  useDuplicateIcpProfile,
  useIcpProfiles,
  useUpdateIcpProfile,
} from "@/hooks/use-sales-engine-icp";

export type IcpConfig = {
  profileName: string;
  description?: string;
  industries: string[];
  companySizes: string[];
  revenueRanges: string[];
  territories: string[];
  decisionMakers: string[];
  minMatchScore: number;
  autoSyncCrm: boolean;
  enrichContactDetails: boolean;
  customPrompt: string;
};

export type IcpProfile = {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  leadCount: number;
  lastUpdated: string;
  config: IcpConfig;
};

const BLANK_ICP_CONFIG: IcpConfig = {
  profileName: "",
  description: "",
  industries: ["FMCG & Retail"],
  companySizes: ["51-200"],
  revenueRanges: ["$1M - $10M"],
  territories: ["Lagos, NG"],
  decisionMakers: ["Head of Sales"],
  minMatchScore: 75,
  autoSyncCrm: true,
  enrichContactDetails: true,
  customPrompt: "",
};

const AVAILABLE_INDUSTRIES = [
  "FMCG & Retail",
  "Logistics & Fleet",
  "Agro & Commodities",
  "Fintech & Payments",
  "Health & Pharma",
  "Manufacturing",
  "Energy & Utilities",
  "Construction & Real Estate",
];

const AVAILABLE_COMPANY_SIZES = [
  { label: "1-10", desc: "Micro" },
  { label: "11-50", desc: "Small" },
  { label: "51-200", desc: "Mid-Market" },
  { label: "201-500", desc: "Growth" },
  { label: "500+", desc: "Enterprise" },
];

const AVAILABLE_REVENUE_RANGES = [
  "< $500K",
  "$500K - $1M",
  "$1M - $10M",
  "$10M - $50M",
  "$50M+",
];

const AVAILABLE_TERRITORIES = [
  "Lagos, NG",
  "Abuja, NG",
  "Port Harcourt, NG",
  "Kano, NG",
  "Nairobi, KE",
  "Accra, GH",
  "Johannesburg, SA",
  "Kigali, RW",
];

const AVAILABLE_DECISION_MAKERS = [
  "Head of Sales",
  "Chief Commercial Officer",
  "Supply Chain Director",
  "Procurement Manager",
  "Managing Director / CEO",
  "Operations Director",
  "Head of Growth",
];

interface IcpBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IcpBuilderModal({ isOpen, onClose }: IcpBuilderModalProps) {
  // If user has existing profiles, default to "list" view; otherwise immediately open "form" view
  const [viewMode, setViewMode] = useState<"list" | "form">("list");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);

  const [formConfig, setFormConfig] = useState<IcpConfig>(BLANK_ICP_CONFIG);
  const [activeTab, setActiveTab] = useState<"criteria" | "scoring">("criteria");

  const [customIndustryInput, setCustomIndustryInput] = useState("");
  const [customRoleInput, setCustomRoleInput] = useState("");
  const [customTerritoryInput, setCustomTerritoryInput] = useState("");

  const {
    data: profiles = [],
    isLoading: isLoadingProfiles,
    isAuthLoading,
    authError,
    error: profilesError,
  } = useIcpProfiles();
  const isConnecting = isAuthLoading || isLoadingProfiles;
  const connectionError = authError ?? profilesError;

  const createProfile = useCreateIcpProfile({
    onSuccess: (profile) => {
      toast.success(`Created & Activated "${profile.name}"`);
      setViewMode("list");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to create ICP build.")),
  });
  const updateProfile = useUpdateIcpProfile({
    onSuccess: (profile) => {
      toast.success(`Updated "${profile.name}"`);
      setViewMode("list");
    },
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to update ICP build.")),
  });
  const deleteProfile = useDeleteIcpProfile({
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to remove ICP build.")),
  });
  const activateProfile = useActivateIcpProfile({
    onSuccess: (profile) => toast.success(`Switched active ICP to "${profile.name}"`),
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to activate ICP build.")),
  });
  const duplicateProfile = useDuplicateIcpProfile({
    onSuccess: (profile) => toast.success(`Duplicated "${profile.name}"`),
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to duplicate ICP build.")),
  });

  if (!isOpen) return null;

  // Determine initial display if profiles is empty (wait for the first load to settle first)
  const isFormOnly = !isConnecting && !connectionError && profiles.length === 0;
  const currentMode = isFormOnly ? "form" : viewMode;

  const handleStartCreateNew = () => {
    setEditingProfileId(null);
    setFormConfig({
      ...BLANK_ICP_CONFIG,
      profileName: `New ICP Build #${profiles.length + 1}`,
      description: "Custom target criteria profile for AI discovery.",
    });
    setActiveTab("criteria");
    setViewMode("form");
  };

  const handleStartEdit = (profile: IcpProfile) => {
    setEditingProfileId(profile.id);
    setFormConfig({ ...profile.config });
    setActiveTab("criteria");
    setViewMode("form");
  };

  const handleDuplicate = (profile: IcpProfile) => {
    duplicateProfile.mutate(profile.id);
  };

  const handleDelete = (id: string, name: string) => {
    deleteProfile.mutate(id, { onSuccess: () => toast.success(`Removed "${name}"`) });
  };

  const handleActivateProfile = (profile: IcpProfile) => {
    if (profile.isActive) return;
    activateProfile.mutate(profile.id);
  };

  const toggleArrayItem = (key: keyof IcpConfig, item: string) => {
    setFormConfig((prev) => {
      const currentList = prev[key] as string[];
      const exists = currentList.includes(item);
      return {
        ...prev,
        [key]: exists
          ? currentList.filter((i) => i !== item)
          : [...currentList, item],
      };
    });
  };

  const handleAddCustomIndustry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customIndustryInput.trim()) return;
    if (!formConfig.industries.includes(customIndustryInput.trim())) {
      setFormConfig((prev) => ({
        ...prev,
        industries: [...prev.industries, customIndustryInput.trim()],
      }));
    }
    setCustomIndustryInput("");
  };

  const handleAddCustomRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customRoleInput.trim()) return;
    if (!formConfig.decisionMakers.includes(customRoleInput.trim())) {
      setFormConfig((prev) => ({
        ...prev,
        decisionMakers: [...prev.decisionMakers, customRoleInput.trim()],
      }));
    }
    setCustomRoleInput("");
  };

  const handleAddCustomTerritory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTerritoryInput.trim()) return;
    if (!formConfig.territories.includes(customTerritoryInput.trim())) {
      setFormConfig((prev) => ({
        ...prev,
        territories: [...prev.territories, customTerritoryInput.trim()],
      }));
    }
    setCustomTerritoryInput("");
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const profileTitle = formConfig.profileName.trim() || "Untitled ICP Build";
    const config = { ...formConfig, profileName: profileTitle };

    if (editingProfileId) {
      updateProfile.mutate({
        id: editingProfileId,
        payload: { name: profileTitle, description: formConfig.description, config },
      });
    } else {
      createProfile.mutate({
        name: profileTitle,
        description: formConfig.description || "Custom configured target ICP profile.",
        config,
      });
    }
  };

  const isSavingForm = createProfile.isPending || updateProfile.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-end justify-center sm:justify-end p-0 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 cursor-pointer"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div className="relative bg-white rounded-t-[28px] sm:rounded-[28px] w-full sm:w-[520px] md:w-[560px] shadow-[0px_16px_48px_rgba(0,0,0,0.18)] overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[calc(100vh-60px)] transition-all duration-300 ease-out border border-gray-100">
        
        {/* Header with Signature Curve & Gradient */}
        <div className="relative h-20 bg-gradient-to-r from-[#09232D] via-[#0D3645] to-[#0A2632] px-6 flex items-center justify-between shrink-0 overflow-hidden text-white shadow-sm">
          {/* Background Decorative SVG curves & glows */}
          <div className="absolute -top-12 -right-8 w-44 h-44 bg-gradient-to-br from-[#0EA5E9]/30 to-[#10B981]/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute top-0 right-0 w-[45%] h-full pointer-events-none opacity-40">
            <svg
              viewBox="0 0 200 80"
              fill="none"
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <path
                d="M0 0 C70 30, 30 55, 190 80 L200 100 L200 0 Z"
                fill="#ffffff"
                fillOpacity="0.12"
              />
            </svg>
          </div>

          <div className="relative z-10 flex items-center gap-3">
            {currentMode === "form" && profiles.length > 0 ? (
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white/90 backdrop-blur-md ring-1 ring-white/20 hover:bg-white/20 transition-colors cursor-pointer"
                title="Back to Profiles"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/25 shadow-inner">
                <Sparkles className="h-5 w-5 text-[#38BDF8]" />
              </div>
            )}

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-bold tracking-tight text-white">
                  {currentMode === "list"
                    ? "ICP Builds & Profiles"
                    : editingProfileId
                    ? "Edit ICP Build"
                    : "Create ICP Build"}
                </h2>
                <span className="rounded-full bg-gradient-to-r from-emerald-400/20 to-teal-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/30">
                  {profiles.length} Active Builds
                </span>
              </div>
              <p className="text-[11px] text-white/70">
                {currentMode === "list"
                  ? "Select, manage or switch targeting models for Sales Engine"
                  : "Define target criteria & qualification rules for lead discovery"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* MODE 1: LIST VIEW (When profiles exist) */}
        {currentMode === "list" && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#fafafa]">
            {/* Action Bar */}
            <div className="flex items-center justify-between border-b border-gray-200/70 bg-white px-6 py-3 shrink-0">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-gray-700">
                <Layers size={15} className="text-[#09232D]" />
                <span>Switch Targeting Model</span>
              </div>
              <button
                type="button"
                onClick={handleStartCreateNew}
                className="flex items-center gap-1.5 rounded-xl bg-[#09232D] px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-xs hover:bg-[#0d3645] transition-colors cursor-pointer"
              >
                <Plus size={14} className="stroke-[2.5]" />
                New ICP Build
              </button>
            </div>

            {/* Scrollable Profiles List */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3.5">
              {isConnecting && !connectionError && (
                <p className="py-8 text-center text-[12px] text-gray-400">
                  {isAuthLoading ? "Connecting to Sales Engine…" : "Loading ICP builds…"}
                </p>
              )}
              {connectionError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-center">
                  <p className="text-[12px] font-semibold text-red-700">
                    Couldn&apos;t connect to Sales Engine
                  </p>
                  <p className="mt-1 text-[11px] text-red-500">
                    {getApiErrorMessage(connectionError, "Please try again.")}
                  </p>
                </div>
              )}
              {profiles.map((prof) => {
                const isActive = prof.isActive;
                return (
                  <div
                    key={prof.id}
                    className={`group relative rounded-2xl border bg-white p-4.5 transition-all duration-200 shadow-xs ${
                      isActive
                        ? "border-[#09232D] ring-2 ring-[#09232D]/10 bg-gradient-to-br from-white via-white to-sky-50/30"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                    }`}
                  >
                    {/* Top Row: Name & Status Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleActivateProfile(prof)}
                          className="mt-0.5 shrink-0 cursor-pointer"
                          title={isActive ? "Currently Active" : "Click to Activate"}
                        >
                          {isActive ? (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#09232D] text-white shadow-xs ring-2 ring-[#09232D]/20">
                              <Check size={12} className="stroke-[3]" />
                            </div>
                          ) : (
                            <div className="h-5 w-5 rounded-full border-2 border-gray-300 hover:border-[#09232D] transition-colors" />
                          )}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-[14px] font-bold text-[#09232D] leading-snug">
                              {prof.name}
                            </h3>
                            {isActive && (
                              <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 text-[10px] font-bold">
                                Active Model
                              </span>
                            )}
                          </div>
                          {prof.description && (
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                              {prof.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Top Right Action Icons */}
                      <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(prof)}
                          className="p-1.5 text-gray-400 hover:text-[#09232D] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit ICP Profile"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(prof)}
                          className="p-1.5 text-gray-400 hover:text-[#09232D] hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                          title="Duplicate Profile"
                        >
                          <Copy size={14} />
                        </button>
                        {profiles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDelete(prof.id, prof.name)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            title="Delete Profile"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Criteria Tags Summary */}
                    <div className="mt-3.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                        {prof.config.industries.slice(0, 2).join(", ")}
                        {prof.config.industries.length > 2
                          ? ` +${prof.config.industries.length - 2}`
                          : ""}
                      </span>
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                        📍 {prof.config.territories.slice(0, 2).join(", ")}
                        {prof.config.territories.length > 2
                          ? ` +${prof.config.territories.length - 2}`
                          : ""}
                      </span>
                      <span className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/50 px-2 py-0.5 text-[10px] font-semibold">
                        🎯 {prof.config.minMatchScore}% Min Fit
                      </span>
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                        👥 {prof.config.decisionMakers.length} Roles
                      </span>
                    </div>

                    {/* Bottom Activation / Selection Bar */}
                    <div className="mt-3 flex items-center justify-between text-[11px] text-gray-400 pt-1">
                      <span>Updated {prof.lastUpdated}</span>
                      {!isActive ? (
                        <button
                          type="button"
                          onClick={() => handleActivateProfile(prof)}
                          className="font-semibold text-[#09232D] hover:underline cursor-pointer flex items-center gap-1"
                        >
                          Activate in Sales Engine <ArrowRight size={12} />
                        </button>
                      ) : (
                        <span className="font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Driving Active Discovery
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* List Footer */}
            <div className="border-t border-gray-200/80 bg-white px-6 py-4 flex items-center justify-between shrink-0">
              <span className="text-[12px] text-gray-500">
                Active ICP drives lead ranking & auto-qualification.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-[#09232D] px-5 py-2 text-[13px] font-semibold text-white hover:bg-[#0d3645] transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* MODE 2: FORM VIEW (Create / Edit ICP) */}
        {currentMode === "form" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab Navigation (2 Clean Tabs) */}
            <div className="flex border-b border-gray-100 bg-[#fbfbfb] px-6 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab("criteria")}
                className={`flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-all cursor-pointer ${
                  activeTab === "criteria"
                    ? "border-[#09232D] text-[#09232D]"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <Target size={15} />
                Target Criteria
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("scoring")}
                className={`flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-all cursor-pointer ${
                  activeTab === "scoring"
                    ? "border-[#09232D] text-[#09232D]"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <Sliders size={15} />
                Scoring & Automation
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form
              id="icp-builder-form"
              onSubmit={handleSaveForm}
              className="flex-1 overflow-y-auto px-6 py-5 text-[#09232D]"
            >
              {/* TAB 1: TARGET CRITERIA */}
              {activeTab === "criteria" && (
                <div className="space-y-5">
                  {/* Profile Preset Name */}
                  <div>
                    <label className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-gray-700">
                      <span>ICP Profile Name</span>
                      <span className="text-[11px] font-normal text-gray-400">
                        Required
                      </span>
                    </label>
                    <input
                      type="text"
                      value={formConfig.profileName}
                      onChange={(e) =>
                        setFormConfig((prev) => ({ ...prev, profileName: e.target.value }))
                      }
                      placeholder="e.g. Tier-1 FMCG Distributors"
                      className="w-full rounded-2xl border border-gray-200 bg-[#F6F6F6] px-4 py-3 text-[13px] text-[#09232D] outline-none transition-all placeholder:text-gray-400 focus:border-[#09232D]/40 focus:bg-white focus:ring-2 focus:ring-[#09232D]/10"
                      required
                    />
                  </div>

                  {/* Profile Description */}
                  <div>
                    <label className="mb-1.5 block text-[12px] font-semibold text-gray-700">
                      Description / Target Objective
                    </label>
                    <input
                      type="text"
                      value={formConfig.description || ""}
                      onChange={(e) =>
                        setFormConfig((prev) => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Brief note on what this ICP model targets..."
                      className="w-full rounded-xl border border-gray-200 bg-[#F6F6F6] px-4 py-2.5 text-[12px] text-[#09232D] outline-none placeholder:text-gray-400 focus:border-[#09232D]/40 focus:bg-white"
                    />
                  </div>

                  {/* Target Industries */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                        <Building2 size={15} className="text-gray-400" />
                        Target Industry Verticals
                      </label>
                      <span className="text-[11px] text-gray-400">
                        {formConfig.industries.length} selected
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_INDUSTRIES.map((ind) => {
                        const isSelected = formConfig.industries.includes(ind);
                        return (
                          <button
                            key={ind}
                            type="button"
                            onClick={() => toggleArrayItem("industries", ind)}
                            className={`group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#09232D] text-white shadow-xs"
                                : "bg-[#f3f4f6] text-gray-600 hover:bg-gray-200/80 hover:text-gray-900"
                            }`}
                          >
                            {isSelected ? (
                              <Check size={12} className="stroke-[3]" />
                            ) : (
                              <Plus size={12} className="text-gray-400 group-hover:text-gray-600" />
                            )}
                            {ind}
                          </button>
                        );
                      })}
                      {formConfig.industries
                        .filter((ind) => !AVAILABLE_INDUSTRIES.includes(ind))
                        .map((ind) => (
                          <button
                            key={ind}
                            type="button"
                            onClick={() => toggleArrayItem("industries", ind)}
                            className="flex items-center gap-1.5 rounded-full bg-[#09232D] px-3 py-1.5 text-[12px] font-medium text-white shadow-xs cursor-pointer"
                          >
                            <Check size={12} className="stroke-[3]" />
                            {ind}
                            <X size={12} className="text-white/60" />
                          </button>
                        ))}
                    </div>

                    {/* Custom Industry Input */}
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={customIndustryInput}
                        onChange={(e) => setCustomIndustryInput(e.target.value)}
                        placeholder="Add other custom industry..."
                        className="flex-1 rounded-xl border border-gray-200 bg-[#F6F6F6] px-3.5 py-2 text-[12px] text-[#09232D] outline-none placeholder:text-gray-400 focus:border-[#09232D]/30 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomIndustry}
                        className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Company Headcount */}
                  <div className="space-y-2.5">
                    <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                      <Users size={15} className="text-gray-400" />
                      Target Company Size (Employees)
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {AVAILABLE_COMPANY_SIZES.map((size) => {
                        const isSelected = formConfig.companySizes.includes(size.label);
                        return (
                          <button
                            key={size.label}
                            type="button"
                            onClick={() => toggleArrayItem("companySizes", size.label)}
                            className={`flex flex-col items-center justify-center rounded-xl p-2 text-center transition-all cursor-pointer border ${
                              isSelected
                                ? "border-[#09232D] bg-[#09232D] text-white shadow-xs"
                                : "border-gray-200 bg-[#F6F6F6] text-gray-700 hover:border-gray-300 hover:bg-gray-100"
                            }`}
                          >
                            <span className="text-[12px] font-bold">{size.label}</span>
                            <span
                              className={`text-[9px] ${
                                isSelected ? "text-white/70" : "text-gray-400"
                              }`}
                            >
                              {size.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Annual Revenue */}
                  <div className="space-y-2.5">
                    <label className="text-[12px] font-semibold text-gray-700">
                      Estimated Annual Revenue Range
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_REVENUE_RANGES.map((rev) => {
                        const isSelected = formConfig.revenueRanges.includes(rev);
                        return (
                          <button
                            key={rev}
                            type="button"
                            onClick={() => toggleArrayItem("revenueRanges", rev)}
                            className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer border ${
                              isSelected
                                ? "border-[#09232D] bg-[#09232D] text-white"
                                : "border-gray-200 bg-[#F6F6F6] text-gray-600 hover:border-gray-300"
                            }`}
                          >
                            {rev}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Target Territories / Hubs */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                        <MapPin size={15} className="text-gray-400" />
                        Target Geographic Hubs & Territories
                      </label>
                      <span className="text-[11px] text-gray-400">
                        {formConfig.territories.length} hubs
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_TERRITORIES.map((terr) => {
                        const isSelected = formConfig.territories.includes(terr);
                        return (
                          <button
                            key={terr}
                            type="button"
                            onClick={() => toggleArrayItem("territories", terr)}
                            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#09232D] text-white"
                                : "bg-[#f3f4f6] text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {isSelected && <Check size={12} />}
                            {terr}
                          </button>
                        );
                      })}
                      {formConfig.territories
                        .filter((terr) => !AVAILABLE_TERRITORIES.includes(terr))
                        .map((terr) => (
                          <button
                            key={terr}
                            type="button"
                            onClick={() => toggleArrayItem("territories", terr)}
                            className="flex items-center gap-1 rounded-full bg-[#09232D] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer"
                          >
                            <Check size={12} />
                            {terr}
                            <X size={12} className="text-white/60" />
                          </button>
                        ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={customTerritoryInput}
                        onChange={(e) => setCustomTerritoryInput(e.target.value)}
                        placeholder="Add city or region (e.g. Mombasa, KE)..."
                        className="flex-1 rounded-xl border border-gray-200 bg-[#F6F6F6] px-3.5 py-2 text-[12px] text-[#09232D] outline-none placeholder:text-gray-400 focus:border-[#09232D]/30 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomTerritory}
                        className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Decision Makers & Roles */}
                  <div className="space-y-2.5">
                    <label className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-700">
                      <Briefcase size={15} className="text-gray-400" />
                      Target Decision Maker Titles / Roles
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {AVAILABLE_DECISION_MAKERS.map((role) => {
                        const isSelected = formConfig.decisionMakers.includes(role);
                        return (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleArrayItem("decisionMakers", role)}
                            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#09232D] text-white"
                                : "bg-[#f3f4f6] text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                      {formConfig.decisionMakers
                        .filter((role) => !AVAILABLE_DECISION_MAKERS.includes(role))
                        .map((role) => (
                          <button
                            key={role}
                            type="button"
                            onClick={() => toggleArrayItem("decisionMakers", role)}
                            className="flex items-center gap-1.5 rounded-full bg-[#09232D] px-3 py-1.5 text-[12px] font-medium text-white cursor-pointer"
                          >
                            {role}
                            <X size={12} className="text-white/60" />
                          </button>
                        ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={customRoleInput}
                        onChange={(e) => setCustomRoleInput(e.target.value)}
                        placeholder="Add custom persona / title..."
                        className="flex-1 rounded-xl border border-gray-200 bg-[#F6F6F6] px-3.5 py-2 text-[12px] text-[#09232D] outline-none placeholder:text-gray-400 focus:border-[#09232D]/30 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomRole}
                        className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SCORING & AUTOMATION */}
              {activeTab === "scoring" && (
                <div className="space-y-6">
                  {/* Minimum Score Threshold Slider */}
                  <div className="rounded-2xl border border-gray-200 bg-[#FBFBFB] p-4.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[13px] font-bold text-[#09232D]">
                          Minimum ICP Match Threshold
                        </span>
                        <p className="text-[11px] text-gray-500">
                          Leads scoring below this will be filtered out
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-1 text-white shadow-xs">
                        <Sparkles size={13} />
                        <span className="text-[13px] font-bold">
                          {formConfig.minMatchScore}%
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2">
                      <input
                        type="range"
                        min="50"
                        max="95"
                        step="5"
                        value={formConfig.minMatchScore}
                        onChange={(e) =>
                          setFormConfig((prev) => ({
                            ...prev,
                            minMatchScore: Number(e.target.value),
                          }))
                        }
                        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-[#09232D]"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 font-medium px-1">
                        <span>50% (Broad reach)</span>
                        <span>75% (Recommended)</span>
                        <span>95% (Strict match)</span>
                      </div>
                    </div>
                  </div>

                  {/* Automation Toggles */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-3.5">
                      <div className="pr-4">
                        <span className="text-[13px] font-bold text-[#09232D]">
                          Auto-Push Qualified to CRM Pipeline
                        </span>
                        <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
                          Automatically sync discovered leads that exceed match threshold to CRM.
                        </p>
                      </div>
                      <Toggle
                        enabled={formConfig.autoSyncCrm}
                        onToggle={() =>
                          setFormConfig((prev) => ({
                            ...prev,
                            autoSyncCrm: !prev.autoSyncCrm,
                          }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-3.5">
                      <div className="pr-4">
                        <span className="text-[13px] font-bold text-[#09232D]">
                          Auto-Enrich Phone & Decision Maker Emails
                        </span>
                        <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
                          Extract direct contact info from verified registry & LinkedIn indexes.
                        </p>
                      </div>
                      <Toggle
                        enabled={formConfig.enrichContactDetails}
                        onToggle={() =>
                          setFormConfig((prev) => ({
                            ...prev,
                            enrichContactDetails: !prev.enrichContactDetails,
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* AI Discovery Nuance & Custom Prompt */}
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between text-[12px] font-semibold text-gray-700">
                      <span className="flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-500" />
                        AI Agent Custom Discovery Prompt
                      </span>
                      <span className="text-[10px] font-normal text-gray-400">
                        Natural language context
                      </span>
                    </label>
                    <textarea
                      rows={4}
                      value={formConfig.customPrompt}
                      onChange={(e) =>
                        setFormConfig((prev) => ({ ...prev, customPrompt: e.target.value }))
                      }
                      placeholder="Provide specific guidelines, regional quirks, or exclusions for the AI model..."
                      className="w-full rounded-2xl border border-gray-200 bg-[#F6F6F6] p-3.5 text-[12px] text-[#09232D] outline-none transition-all placeholder:text-gray-400 focus:border-[#09232D]/40 focus:bg-white focus:ring-2 focus:ring-[#09232D]/10 leading-relaxed"
                    />
                  </div>
                </div>
              )}
            </form>

            {/* Form Footer Bar */}
            <div className="border-t border-gray-100 bg-[#fbfbfb] px-6 py-4 flex items-center justify-between shrink-0">
              {profiles.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  className="text-[12px] font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setFormConfig(BLANK_ICP_CONFIG)}
                  className="text-[12px] font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                >
                  Clear Fields
                </button>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  form="icp-builder-form"
                  disabled={isSavingForm}
                  className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#09232D] via-[#0E3D4E] to-[#0A2632] px-5 py-2.5 text-[13px] font-semibold text-white shadow-md transition-all hover:shadow-lg hover:brightness-110 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles size={15} className="text-[#38BDF8] group-hover:rotate-12 transition-transform" />
                  {isSavingForm ? "Saving…" : editingProfileId ? "Save Changes" : "Save & Activate ICP"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
