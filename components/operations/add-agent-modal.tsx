"use client";

import { useState, useRef } from "react";
import { X, ChevronDown, ImagePlus, Plus } from "lucide-react";

const ZONE_OPTIONS = [
  "Ikeja LGA",
  "Surulere LGA",
  "Lekki LGA",
  "Victoria Island",
  "Yaba LGA",
  "Oshodi LGA",
];
const ROLE_OPTIONS = ["Supervisor", "Field Agent", "Staff"];

// Preset avatar colours + initials (placeholder until real assets exist)
const PRESET_AVATARS = [
  { bg: "#C9A96E", initials: "AA" },
  { bg: "#3D2B1F", initials: "BB" },
  { bg: "#8B72BE", initials: "CC" },
  { bg: "#5BBFB5", initials: "DD" },
];

const EMPTY_FORM = {
  name: "",
  email: "",
  role: "",
  zone: "",
  salary: "",
  commissionEnabled: false,
  fillForAgent: false,
  phone: "",
  gender: "" as "Male" | "Female" | "",
  avatarIndex: -1,
  avatarCustom: null as string | null,
};

type FormState = typeof EMPTY_FORM;

const INPUT_CLS =
  "w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-[13px] text-[#0B1215] outline-none focus:border-[#094B5C] transition-colors placeholder:text-gray-300 appearance-none";

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[12px] text-gray-400 font-medium shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-3">
      <span className="text-[13px] text-gray-500">{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-green-500" : "bg-gray-300"}`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-0.5"}`}
      />
      {on && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-white">
          I
        </span>
      )}
    </button>
  );
}

export function AddAgentModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleCustomAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    set("avatarCustom", URL.createObjectURL(file));
    set("avatarIndex", -1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-12 mt-17 mb-3.25 rounded-[30px] z-50 w-full max-w-110 bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Close button */}
        <div className="flex justify-end px-6 pt-5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Heading */}
        <div className="px-6 pb-4 shrink-0">
          <h2 className="text-[22px] font-extrabold text-[#0B1215] leading-tight">
            Enter Appropriate
            <br />
            Agent Details
          </h2>
        </div>

        {/* Scrollable body */}
        <form
          id="add-agent-form"
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-4"
        >
          <SectionDivider label="Add New Agent" />

          <div className="space-y-3">
            {/* Fullname */}
            <FieldRow label="Fullname">
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="E.g Alison Thomson"
                className={INPUT_CLS}
              />
            </FieldRow>

            {/* Email */}
            <FieldRow label="Email">
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="E.g alison@company.com"
                className={INPUT_CLS}
              />
            </FieldRow>

            {/* Role */}
            <FieldRow label="Role">
              <div className="relative">
                <select
                  required
                  value={form.role}
                  onChange={(e) => set("role", e.target.value)}
                  className={`${INPUT_CLS} pr-9 cursor-pointer`}
                >
                  <option value="" disabled>
                    E.g Staff
                  </option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>
            </FieldRow>

            {/* Zone */}
            <FieldRow label="Zone">
              <div className="relative">
                <select
                  required
                  value={form.zone}
                  onChange={(e) => set("zone", e.target.value)}
                  className={`${INPUT_CLS} pr-9 cursor-pointer`}
                >
                  <option value="" disabled>
                    E.g Ikeja LGA
                  </option>
                  {ZONE_OPTIONS.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>
            </FieldRow>

            {/* Salary */}
            <FieldRow label="Salary">
              <div className="relative">
                <input
                  type="text"
                  value={form.salary}
                  onChange={(e) =>
                    set("salary", e.target.value.replace(/[^0-9,]/g, ""))
                  }
                  placeholder="E.g ₦120,000"
                  className={INPUT_CLS}
                />
              </div>
            </FieldRow>

            {/* Commission Enable */}
            <FieldRow label="Commission Enable">
              <Toggle
                on={form.commissionEnabled}
                onToggle={() =>
                  set("commissionEnabled", !form.commissionEnabled)
                }
              />
            </FieldRow>
          </div>

          {/* For Agent section */}
          <SectionDivider label="For Agent" />

          <FieldRow label="Fill for Agent">
            <Toggle
              on={form.fillForAgent}
              onToggle={() => set("fillForAgent", !form.fillForAgent)}
            />
          </FieldRow>

          {/* Agent Details — shown only when Fill for Agent is ON */}
          {form.fillForAgent && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
              <SectionDivider label="Agent Details" />

              <div className="space-y-3">
                {/* Phone */}
                <FieldRow label="Phone Number">
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    placeholder="E.g +234 9099999999"
                    className={INPUT_CLS}
                  />
                </FieldRow>

                {/* Gender */}
                <FieldRow label="Gender">
                  <div className="relative">
                    <select
                      value={form.gender}
                      onChange={(e) =>
                        set("gender", e.target.value as FormState["gender"])
                      }
                      className={`${INPUT_CLS} pr-9 cursor-pointer`}
                    >
                      <option value="" disabled>
                        E.g Male
                      </option>
                      <option>Male</option>
                      <option>Female</option>
                    </select>
                    <ChevronDown
                      size={13}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                    />
                  </div>
                </FieldRow>
              </div>

              {/* Avatar picker */}
              <div className="flex items-start gap-4 pt-1">
                {/* Custom photo upload */}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-400 transition-colors shrink-0 overflow-hidden"
                >
                  {form.avatarCustom ? (
                    <img
                      src={form.avatarCustom}
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
                          form.avatarIndex === i
                            ? "ring-2 ring-offset-2 ring-[#094B5C]"
                            : ""
                        }`}
                        style={{ backgroundColor: av.bg }}
                      >
                        {av.initials}
                      </button>
                    ))}
                    {/* Add more */}
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="w-12 h-12 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center text-gray-400 hover:border-gray-400 transition-colors shrink-0"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Footer — fixed */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0">
          <button
            type="submit"
            form="add-agent-form"
            className="w-full py-3 bg-[#09232D] text-white text-[13px] font-bold rounded-2xl hover:opacity-90 transition-all shadow-lg"
          >
            {form.fillForAgent ? "Done" : "Add Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
