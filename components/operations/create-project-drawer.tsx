"use client";

import { useState } from "react";
import { X, ChevronDown, User } from "lucide-react";

const PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;
const STATUS_OPTIONS = ["In progress", "Pending", "Completed"] as const;
const CATEGORY_OPTIONS = [
  "Outreach",
  "Sales",
  "Inspection",
  "Delivery",
  "Awareness",
  "Other",
];
const LEAD_OPTIONS = [
  "Tunde Balogun",
  "Ridwan Thomson",
  "Amaka Osei",
  "Abdul Kareem",
];

type Priority = (typeof PRIORITY_OPTIONS)[number];
type Status = (typeof STATUS_OPTIONS)[number];

const EMPTY = {
  name: "",
  description: "",
  category: "",
  lead: "",
  startDate: "",
  deadline: "",
  priority: "" as Priority | "",
  status: "In progress" as Status,
  trackAttendance: true,
  commissionEnabled: false,
};

const FIELD =
  "w-full bg-[#F6F6F6] border border-gray-200 rounded-2xl px-4 py-3.5 text-[13px] text-[#09232D] outline-none focus:ring-2 focus:ring-[#09232D]/10 focus:border-[#09232D]/30 transition-all placeholder:text-gray-300";
const LABEL = "text-[12px] font-medium text-[#6B7280] w-28 shrink-0";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className={LABEL}>{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div
      onClick={onChange}
      className={`relative w-12 h-6 rounded-full cursor-pointer transition-colors shrink-0 ${checked ? "bg-[#22C55E]" : "bg-gray-300"}`}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? "left-6" : "left-0.5"}`}
      />
      {checked && (
        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-black text-white">
          I
        </span>
      )}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[11px] font-semibold text-gray-400 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

export function CreateProjectDrawer({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const set = <K extends keyof typeof EMPTY>(key: K, val: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // wire up to real API here
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-12 mt-17 mb-3.25 rounded-[30px] z-50 w-full max-w-110 bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* ── Decorative header ─────────────────────────────── */}
        <div className="relative px-7 pt-8 pb-6 shrink-0 overflow-hidden">
          {/* Dark blob top-right */}
          {/* <div
            className="absolute -top-6 -right-6 w-36 h-36 bg-[#09232D] rounded-full opacity-90"
            style={{ borderRadius: '40% 60% 55% 45% / 45% 40% 60% 55%' }}
          /> */}
          {/* <div
            className="absolute top-0 right-8 w-20 h-20 bg-[#09232D]/70 rounded-full"
            style={{ borderRadius: '55% 45% 40% 60% / 60% 55% 45% 40%' }}
          /> */}

          <div className="relative z-10 flex items-start justify-between">
            <div>
              <h2 className="text-[20px] font-bold text-[#09232D]">
                Create New Project
              </h2>
              <p className="text-[12px] text-gray-400 mt-0.5">
                Fill in the details below
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors mt-1 shrink-0"
            >
              <X size={15} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* ── Form body ─────────────────────────────────────── */}
        <form
          id="create-project-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-7 py-2 space-y-5"
        >
          <Divider label="Project Details" />

          {/* Name */}
          <Row label="Project Name">
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Product Outreach"
              className={FIELD}
            />
          </Row>

          {/* Description */}
          <Row label="Description">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Briefly describe the project..."
              className={`${FIELD} resize-none`}
            />
          </Row>

          {/* Category */}
          <Row label="Category">
            <div className="relative">
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                className={`${FIELD} appearance-none pr-9 cursor-pointer`}
              >
                <option value="" disabled>
                  Select category
                </option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </Row>

          {/* Project Lead */}
          <Row label="Project Lead">
            <div className="relative">
              <User
                size={13}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <select
                value={form.lead}
                onChange={(e) => set("lead", e.target.value)}
                className={`${FIELD} appearance-none pl-9 pr-9 cursor-pointer`}
              >
                <option value="" disabled>
                  Assign a lead
                </option>
                {LEAD_OPTIONS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </Row>

          <Divider label="Timeline" />

          {/* Start Date */}
          <Row label="Start Date">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => set("startDate", e.target.value)}
              className={FIELD}
            />
          </Row>

          {/* Deadline */}
          <Row label="Deadline">
            <input
              required
              type="date"
              value={form.deadline}
              onChange={(e) => set("deadline", e.target.value)}
              className={FIELD}
            />
          </Row>

          {/* Priority */}
          <Row label="Priority">
            <div className="relative">
              <select
                required
                value={form.priority}
                onChange={(e) => set("priority", e.target.value as Priority)}
                className={`${FIELD} appearance-none pr-9 cursor-pointer`}
              >
                <option value="" disabled>
                  Select priority
                </option>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </Row>

          {/* Status */}
          <Row label="Status">
            <div className="relative">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as Status)}
                className={`${FIELD} appearance-none pr-9 cursor-pointer`}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </Row>

          <Divider label="Settings" />

          <Row label="Track Attendance">
            <Toggle
              checked={form.trackAttendance}
              onChange={() => set("trackAttendance", !form.trackAttendance)}
            />
          </Row>

          <Row label="Commission">
            <Toggle
              checked={form.commissionEnabled}
              onChange={() => set("commissionEnabled", !form.commissionEnabled)}
            />
          </Row>
        </form>

        {/* ── Footer ────────────────────────────────────────── */}
        <div className="px-7 py-5 border-t border-gray-100 shrink-0">
          <button
            type="submit"
            form="create-project-form"
            className="w-full py-3.5 bg-[#09232D] text-white rounded-2xl text-[13px] font-bold hover:opacity-90 transition-all"
          >
            Create Project
          </button>
        </div>
      </div>
    </>
  );
}
