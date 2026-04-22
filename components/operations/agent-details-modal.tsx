"use client";

import { useRef } from "react";
import { ImagePlus, Plus } from "lucide-react";
import { SectionDivider } from "@/components/finance/payroll/section-divider";
import { FormRow } from "@/components/finance/payroll/form-row";
import { InlineInput } from "@/components/finance/payroll/inline-input";
import { InlineSelect } from "@/components/finance/payroll/inline-select";

// Preset avatar colours + initials (placeholder until real assets exist)
const PRESET_AVATARS = [
  { bg: "#C9A96E", initials: "AA" },
  { bg: "#3D2B1F", initials: "BB" },
  { bg: "#8B72BE", initials: "CC" },
  { bg: "#5BBFB5", initials: "DD" },
];

export interface AgentDetails {
  phone: string;
  gender: "Male" | "Female" | "";
  avatarIndex: number;
  avatarCustom: string | null;
}

interface AgentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  details: AgentDetails;
  onDetailsChange: (details: AgentDetails) => void;
  errors?: { phone?: string; gender?: string };
  onClearError?: (field: "phone" | "gender") => void;
}

export function AgentDetailsModal({
  isOpen,
  details,
  onDetailsChange,
  errors = {},
  onClearError,
}: AgentDetailsModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const set = <K extends keyof AgentDetails>(key: K, val: AgentDetails[K]) =>
    onDetailsChange({ ...details, [key]: val });

  const handleCustomAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    set("avatarCustom", URL.createObjectURL(file));
    set("avatarIndex", -1);
  };

  return (
    <div className="fixed right-119.75 bottom-3.25 z-60">
      <div className="relative bg-white rounded-3xl w-full max-w-105 p-7 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026]">
        <h3 className="text-[20px] font-bold text-[#0B1215] mb-6">
          Agent Details
        </h3>

        <SectionDivider label="Personal Information" />

        <div className="space-y-4 mb-6">
          <div>
            <FormRow label="Phone Number">
              <InlineInput
                value={details.phone}
                onChange={(e) => { set("phone", e.target.value); onClearError?.("phone"); }}
                placeholder="E.g +234 9099999999"
                className="col-span-2"
              />
            </FormRow>
            {errors.phone && <p className="text-[11px] text-red-500 mt-0.5 text-right">{errors.phone}</p>}
          </div>

          <div>
            <FormRow label="Gender">
              <InlineSelect
                value={details.gender}
                onChange={(e) => { set("gender", e.target.value as AgentDetails["gender"]); onClearError?.("gender"); }}
                className="col-span-2"
              >
                <option value="" disabled>
                  E.g Male
                </option>
                <option>Male</option>
                <option>Female</option>
              </InlineSelect>
            </FormRow>
            {errors.gender && <p className="text-[11px] text-red-500 mt-0.5 text-right">{errors.gender}</p>}
          </div>
        </div>

        <SectionDivider label="Profile Picture" />

        {/* Avatar picker */}
        <div className="flex items-start gap-4 pt-2 mb-6">
          {/* Custom photo upload */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-400 transition-colors shrink-0 overflow-hidden"
          >
            {details.avatarCustom ? (
              <img
                src={details.avatarCustom}
                alt="custom"
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <ImagePlus size={18} />
                <span className="text-[10px] text-center leading-tight">
                  Click to add
                  <br />
                  profile picture
                </span>
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCustomAvatar}
          />

          {/* Presets */}
          <div className="flex-1">
            <p className="text-[11px] text-gray-500 mb-2">
              Or, Select any Avatar of your choice
            </p>
            <div className="flex gap-2 flex-wrap">
              {PRESET_AVATARS.map((av, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    set("avatarIndex", i);
                    set("avatarCustom", null);
                  }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-[13px] font-bold transition-all shrink-0 ${
                    details.avatarIndex === i
                      ? "ring-2 ring-offset-2 ring-[#094B5C]"
                      : ""
                  }`}
                  style={{ backgroundColor: av.bg }}
                >
                  {av.initials}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-start">
          <button
            type="submit"
            form="add-agent-form"
            className="w-fit px-9.25 py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
