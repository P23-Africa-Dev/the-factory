"use client";

import React, { useState, useRef } from "react";
import {
  X,
  MapPin,
  User,
  FileText,
  CheckCircle,
  ChevronDown,
  Camera,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth";
import { useInternalUsers } from "@/hooks/use-projects";
import { useCreateTask } from "@/hooks/use-tasks";
import type { DndItem, TaskCategory } from "@/types/operations";
import type { ApiTaskPriority, ApiTaskStatus } from "@/lib/api/tasks";

type StatusType = "pending" | "in-progress" | "completed";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask?: (containerId: StatusType, item: DndItem) => void;
  projectId?: number | string;
}

const STATUS_OPTIONS: {
  value: StatusType;
  label: string;
  color: string;
  short: string;
}[] = [
  {
    value: "pending",
    label: "Pending Task",
    color: "#BD7A22",
    short: "Pending",
  },
  {
    value: "in-progress",
    label: "In Progress",
    color: "#094B5C",
    short: "In Progress",
  },
  {
    value: "completed",
    label: "Completed",
    color: "#4FD1C5",
    short: "Completed",
  },
];

const TASK_TYPES: Record<string, string> = {
  "Sales Visit": "sales_visit",
  "Inspection": "inspection",
  "Delivery": "delivery",
  "Collection": "collection",
  "Awareness": "awareness",
};

const PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;
type Priority = (typeof PRIORITY_OPTIONS)[number];

const PRIORITY_COLORS: Record<Priority, string> = {
  High: "#EF4444",
  Medium: "#F59E0B",
  Low: "#10B981",
};

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function InputWrap({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          {icon}
        </div>
      )}
      {children}
    </div>
  );
}

const BASE_INPUT =
  "w-full bg-gray-50 rounded-xl text-sm text-[#0B1215] outline-none border transition-colors placeholder:text-gray-300";
const INPUT_CLS = (err?: string) =>
  `${BASE_INPUT} py-2.5 ${err ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`;

export function CreateTaskModal({
  isOpen,
  onClose,
  onCreateTask,
  projectId,
}: CreateTaskModalProps) {
  const user = useAuthStore((s) => s.user);
  const companyId = user?.active_company?.id;

  const { data: agents = [], isLoading: loadingAgents } = useInternalUsers({
    role: "agent",
  });

  const { mutate, isPending } = useCreateTask({
    onSuccess: (task) => {
      toast.success("Task created successfully.");
      handleClose();
    },
  });
  const taskIdRef = useRef(0);
  const [form, setForm] = useState({
    title: "",
    taskType: "",
    description: "",
    assignTo: "",
    location: "",
    address: "",
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    dueDate: "",
    requiredActions: "",
    priority: "" as Priority | "",
    minPhotos: "2",
    visitVerification: false,
    status: "pending" as StatusType,
    category: "all" as TaskCategory,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => ({ ...p, [key]: "" }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = "Task title is required";
    if (!form.taskType) errs.taskType = "Task type is required";
    if (!form.description.trim()) errs.description = "Description is required";
    if (!form.assignTo) errs.assignTo = "Please assign to an agent";
    if (!form.location.trim()) errs.location = "Location is required";
    if (!form.dueDate) errs.dueDate = "Due date is required";
    if (!form.priority) errs.priority = "Priority is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    
    // API mode — always use real API when companyId is available
    if (companyId) {
      const typeKey = TASK_TYPES[form.taskType] || "general";
      const priorityVal = form.priority.toLowerCase() as ApiTaskPriority;

      mutate({
        company_id: companyId,
        project_id: projectId ?? undefined,
        title: form.title,
        type: typeKey,
        description: form.description,
        assigned_agent_id: Number(form.assignTo),
        location: form.location,
        address: form.address || undefined,
        latitude: form.latitude,
        longitude: form.longitude,
        due_date: new Date(form.dueDate).toISOString(),
        required_actions: form.requiredActions ? form.requiredActions.split(',').map(s => s.trim()) : undefined,
        priority: priorityVal,
        minimum_photos_required: Number(form.minPhotos),
        visit_verification_required: form.visitVerification,
      }, {
        onError: (err: any) => {
          if (err.errors) {
            const backendErrors = err.errors as Record<string, string[]>;
            const mappedErrors: Record<string, string> = {};
            const ERROR_MAP: Record<string, string> = {
              type: "taskType",
              assigned_agent_id: "assignTo",
              due_date: "dueDate",
              required_actions: "requiredActions",
              minimum_photos_required: "minPhotos",
              visit_verification_required: "visitVerification"
            };
            
            for (const key in backendErrors) {
              const formKey = ERROR_MAP[key] || key;
              mappedErrors[formKey] = backendErrors[key][0];
            }
            setErrors(mappedErrors);
            toast.error(err.message || "Please fix the validation errors");
          } else {
            toast.error(err.message || "Failed to create task");
          }
        }
      });
      return;
    }

    // Fallback to local DnD mock mode
    if (onCreateTask) {
      const agentName = agents.find((a) => a.id.toString() === form.assignTo)?.name || form.assignTo;
      const newItem: DndItem = {
        id: `task-${++taskIdRef.current}`,
        label: agentName,
        description: form.title,
        location: `${form.location}${form.address ? `, ${form.address}` : ""}`,
        time: "Just now",
        category: form.category,
        dueDate: form.dueDate,
        addedDescription: form.description,
        statusLabel: STATUS_OPTIONS.find((s) => s.value === form.status)?.short,
      };
      onCreateTask(form.status, newItem);
      handleClose();
    }
  };

  const handleClose = () => {
    setForm({
      title: "",
      taskType: "",
      description: "",
      assignTo: "",
      location: "",
      address: "",
      latitude: undefined,
      longitude: undefined,
      dueDate: "",
      requiredActions: "",
      priority: "",
      minPhotos: "2",
      visitVerification: false,
      status: "pending",
      category: "all",
    });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />

      <div className="fixed inset-y-0 right-12 mt-17 mb-3.25 rounded-[30px] z-50 w-full max-w-110 bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header — fixed */}
        <div className="px-6 py-5 flex justify-between items-center shrink-0 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-base text-[#0B1215]">
              Create New Task
            </h2>
            <p className="text-gray-400 text-xs mt-0.5">
              Fill in the details to assign a field task
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Task Title */}
          <div>
            <FieldLabel required>Task Title</FieldLabel>
            <InputWrap icon={<FileText size={13} />}>
              <input
                type="text"
                placeholder="e.g. Visit Shoprite Lekki"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className={`${INPUT_CLS(errors.title)} pl-9 pr-4`}
              />
            </InputWrap>
            {errors.title && (
              <p className="text-red-400 text-[11px] mt-1">{errors.title}</p>
            )}
          </div>

          {/* Task Type */}
          <div>
            <FieldLabel required>Task Type</FieldLabel>
            <InputWrap icon={<ChevronDown size={13} />}>
              <select
                value={form.taskType}
                onChange={(e) => set("taskType", e.target.value)}
                className={`${INPUT_CLS(errors.taskType)} pl-4 pr-9 appearance-none cursor-pointer`}
              >
                <option value="" disabled>
                  Select task type
                </option>
                {Object.keys(TASK_TYPES).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </InputWrap>
            {errors.taskType && (
              <p className="text-red-400 text-[11px] mt-1">{errors.taskType}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <FieldLabel required>Description</FieldLabel>
            <textarea
              placeholder="e.g. Check stock and speak to manager"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className={`${BASE_INPUT} py-2.5 px-4 resize-none ${errors.description ? "border-red-300" : "border-gray-200 focus:border-[#094B5C]"}`}
            />
            {errors.description && (
              <p className="text-red-400 text-[11px] mt-1">
                {errors.description}
              </p>
            )}
          </div>

          {/* Assign To */}
          <div>
            <FieldLabel required>Assign To</FieldLabel>
            <InputWrap icon={<User size={13} />}>
              <select
                value={form.assignTo}
                onChange={(e) => set("assignTo", e.target.value)}
                className={`${INPUT_CLS(errors.assignTo)} pl-9 pr-4 appearance-none cursor-pointer`}
              >
                <option value="" disabled>
                  Select agent
                </option>
                {loadingAgents ? (
                  <option disabled>Loading...</option>
                ) : (
                  agents.map((a) => (
                    <option key={a.id} value={a.id.toString()}>
                      {a.name}
                    </option>
                  ))
                )}
              </select>
            </InputWrap>
            {errors.assignTo && (
              <p className="text-red-400 text-[11px] mt-1">{errors.assignTo}</p>
            )}
          </div>

          {/* Location + Address */}
          <div>
            <FieldLabel required>Location</FieldLabel>
            <InputWrap icon={<MapPin size={13} />}>
              <input
                type="text"
                placeholder="e.g. Lekki Phase 1"
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                className={`${INPUT_CLS(errors.location)} pl-9 pr-4`}
              />
            </InputWrap>
            {errors.location && (
              <p className="text-red-400 text-[11px] mt-1">{errors.location}</p>
            )}
          </div>

          <div>
            <FieldLabel>
              Address{" "}
              <span className="text-gray-400 normal-case font-normal">
                (optional)
              </span>
            </FieldLabel>
            <AddressAutocomplete
              value={form.address}
              onChange={(val) => {
                setForm((p) => ({ ...p, address: val, latitude: undefined, longitude: undefined }));
                setErrors((p) => ({ ...p, address: "" }));
              }}
              onSelect={(s) => {
                setForm((p) => ({
                  ...p,
                  address: s.place_name,
                  longitude: s.center[0],
                  latitude: s.center[1],
                }));
              }}
              placeholder="e.g. Admiralty Way, Lekki Phase 1, Lagos"
            />
            {form.latitude != null && (
              <p className="text-[10px] text-[#3A8C88] font-semibold mt-1">
                📍 {form.latitude.toFixed(5)}, {form.longitude?.toFixed(5)}
              </p>
            )}
          </div>

          {/* Due Date + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Due Date</FieldLabel>
              <InputWrap icon={<Calendar size={13} />}>
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                  className={`${INPUT_CLS(errors.dueDate)} pl-9 pr-4`}
                />
              </InputWrap>
              {errors.dueDate && (
                <p className="text-red-400 text-[11px] mt-1">
                  {errors.dueDate}
                </p>
              )}
            </div>

            <div>
              <FieldLabel required>Priority</FieldLabel>
              <InputWrap
                icon={
                  form.priority ? (
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          PRIORITY_COLORS[form.priority as Priority],
                      }}
                    />
                  ) : (
                    <AlertCircle size={13} />
                  )
                }
              >
                <select
                  value={form.priority}
                  onChange={(e) => set("priority", e.target.value as Priority)}
                  className={`${INPUT_CLS(errors.priority)} pl-9 pr-4 appearance-none cursor-pointer`}
                >
                  <option value="" disabled>
                    Select
                  </option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </InputWrap>
              {errors.priority && (
                <p className="text-red-400 text-[11px] mt-1">
                  {errors.priority}
                </p>
              )}
            </div>
          </div>

          {/* Required Actions */}
          <div>
            <FieldLabel>Required Actions</FieldLabel>
            <textarea
              placeholder="e.g. Take photos, confirm stock"
              value={form.requiredActions}
              onChange={(e) => set("requiredActions", e.target.value)}
              rows={2}
              className={`${BASE_INPUT} py-2.5 px-4 resize-none border-gray-200 focus:border-[#094B5C]`}
            />
          </div>

          {/* Upload Requirement + Visit Verification */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Upload Requirement</FieldLabel>
              <InputWrap icon={<Camera size={13} />}>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={form.minPhotos}
                  onChange={(e) => set("minPhotos", e.target.value)}
                  className={`${INPUT_CLS()} pl-9 pr-4`}
                />
              </InputWrap>
              <p className="text-[10px] text-gray-400 mt-1">
                Minimum photos required
              </p>
            </div>

            <div>
              <FieldLabel>Visit Verification</FieldLabel>
              <div
                onClick={() =>
                  set("visitVerification", !form.visitVerification)
                }
                className={`mt-1 flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all select-none ${
                  form.visitVerification
                    ? "bg-[#09232d] border-[#0B1215]"
                    : "bg-gray-50 border-gray-200 hover:border-gray-300"
                }`}
              >
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${form.visitVerification ? "bg-white/20" : "bg-gray-300"}`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-all ${
                      form.visitVerification
                        ? "left-4 bg-white"
                        : "left-0.5 bg-white"
                    }`}
                  />
                </div>
                <span
                  className={`text-[12px] font-bold ${form.visitVerification ? "text-white" : "text-gray-500"}`}
                >
                  {form.visitVerification ? "ON" : "OFF"}
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-100 pt-3 space-y-3">
            {/* Task Status */}
            <div>
              <FieldLabel>Initial Status</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("status", opt.value)}
                    className={`py-2.5 px-2 rounded-xl text-[11px] font-bold transition-all border-2 ${
                      form.status === opt.value
                        ? "text-white shadow-md border-transparent"
                        : "text-gray-500 border-gray-200 bg-gray-50 hover:border-gray-300"
                    }`}
                    style={
                      form.status === opt.value
                        ? { backgroundColor: opt.color, borderColor: opt.color }
                        : {}
                    }
                  >
                    {opt.short}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            {/* <div>
              <FieldLabel>Category</FieldLabel>
              <div className="flex gap-2">
                {CATEGORY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('category', opt.value)}
                    className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold transition-all border-2 ${
                      form.category === opt.value
                        ? 'bg-[#09232d] text-white border-[#0B1215]'
                        : 'text-gray-500 border-gray-200 bg-gray-50 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div> */}
          </div>
        </div>

        {/* Footer — fixed */}
        <div className="px-5 py-4 shrink-0 border-t border-gray-100">
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full py-3 bg-[#09232d] text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="animate-spin" size={15} />
            ) : (
              <CheckCircle size={15} />
            )}
            {isPending ? "Creating..." : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
