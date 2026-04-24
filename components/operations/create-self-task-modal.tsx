'use client';

import React, { useState } from 'react';
import {
  X,
  FileText,
  MapPin,
  Navigation,
  Calendar,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { useCreateSelfTask } from '@/hooks/use-tasks';
import type { ApiTaskPriority } from '@/lib/api/tasks';

interface CreateSelfTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TASK_TYPES: Record<string, string> = {
  'Sales Visit': 'sales_visit',
  Inspection: 'inspection',
  Delivery: 'delivery',
  Collection: 'collection',
  Awareness: 'awareness',
};

const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'] as const;
type Priority = (typeof PRIORITY_OPTIONS)[number];

const PRIORITY_COLORS: Record<Priority, string> = {
  High: '#EF4444',
  Medium: '#F59E0B',
  Low: '#10B981',
};

const BASE_INPUT =
  'w-full bg-gray-50 rounded-xl text-sm text-[#0B1215] outline-none border transition-colors placeholder:text-gray-300';
const INPUT_CLS = (err?: string) =>
  `${BASE_INPUT} py-2.5 ${err ? 'border-red-300' : 'border-gray-200 focus:border-[#094B5C]'}`;

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5">
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

export function CreateSelfTaskModal({ isOpen, onClose }: CreateSelfTaskModalProps) {
  const user = useAuthStore((s) => s.user);
  const companyId = user?.active_company?.id;

  const { mutate, isPending } = useCreateSelfTask({
    onSuccess: () => {
      toast.success('Self-task created successfully.');
      handleClose();
    },
  });

  const [form, setForm] = useState({
    title: '',
    taskType: '',
    description: '',
    location: '',
    address: '',
    dueDate: '',
    requiredActions: '',
    priority: '' as Priority | '',
    minPhotos: '',
    visitVerification: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(key: K, val: (typeof form)[K]) => {
    setForm((p) => ({ ...p, [key]: val }));
    setErrors((p) => ({ ...p, [key]: '' }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.title.trim()) errs.title = 'Task title is required';
    if (!form.taskType) errs.taskType = 'Task type is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    if (!form.location.trim()) errs.location = 'Location is required';
    if (!form.dueDate) errs.dueDate = 'Due date is required';
    if (!form.priority) errs.priority = 'Priority is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (!companyId) {
      toast.error('No active company context.');
      return;
    }

    mutate(
      {
        company_id: companyId,
        title: form.title,
        type: TASK_TYPES[form.taskType] || 'awareness',
        description: form.description,
        location: form.location,
        address: form.address || undefined,
        due_date: new Date(form.dueDate).toISOString(),
        required_actions: form.requiredActions
          ? form.requiredActions.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        priority: form.priority.toLowerCase() as ApiTaskPriority,
        minimum_photos_required: form.minPhotos ? Number(form.minPhotos) : undefined,
        visit_verification_required: form.visitVerification || undefined,
      },
      {
        onError: (err: any) => {
          if (err?.errors) {
            const mapped: Record<string, string> = {};
            const MAP: Record<string, string> = {
              type: 'taskType',
              due_date: 'dueDate',
              required_actions: 'requiredActions',
              minimum_photos_required: 'minPhotos',
            };
            for (const key in err.errors as Record<string, string[]>) {
              mapped[MAP[key] ?? key] = (err.errors as Record<string, string[]>)[key][0];
            }
            setErrors(mapped);
            toast.error(err.message || 'Please fix the errors below.');
          } else {
            toast.error(err?.message || 'Failed to create task.');
          }
        },
      }
    );
  };

  const handleClose = () => {
    setForm({
      title: '',
      taskType: '',
      description: '',
      location: '',
      address: '',
      dueDate: '',
      requiredActions: '',
      priority: '',
      minPhotos: '',
      visitVerification: false,
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
        {/* Header */}
        <div className="px-6 py-5 flex justify-between items-center shrink-0 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-base text-[#0B1215]">Create Self-Task</h2>
            <p className="text-gray-400 text-xs mt-0.5">Create a standalone task for yourself</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div>
            <FieldLabel required>Task Title</FieldLabel>
            <div className="relative">
              <FileText
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="e.g. Follow up route check"
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                className={`${INPUT_CLS(errors.title)} pl-9 pr-4`}
              />
            </div>
            {errors.title && <p className="text-red-400 text-[11px] mt-1">{errors.title}</p>}
          </div>

          <div>
            <FieldLabel required>Task Type</FieldLabel>
            <select
              value={form.taskType}
              onChange={(e) => set('taskType', e.target.value)}
              className={`${INPUT_CLS(errors.taskType)} px-4 appearance-none cursor-pointer`}
            >
              <option value="" disabled>
                Select task type
              </option>
              {Object.keys(TASK_TYPES).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            {errors.taskType && (
              <p className="text-red-400 text-[11px] mt-1">{errors.taskType}</p>
            )}
          </div>

          <div>
            <FieldLabel required>Description</FieldLabel>
            <textarea
              placeholder="e.g. Self-created route check before shift starts"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              className={`${BASE_INPUT} py-2.5 px-4 resize-none ${errors.description ? 'border-red-300' : 'border-gray-200 focus:border-[#094B5C]'}`}
            />
            {errors.description && (
              <p className="text-red-400 text-[11px] mt-1">{errors.description}</p>
            )}
          </div>

          <div>
            <FieldLabel required>Location</FieldLabel>
            <div className="relative">
              <MapPin
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="e.g. Apapa"
                value={form.location}
                onChange={(e) => set('location', e.target.value)}
                className={`${INPUT_CLS(errors.location)} pl-9 pr-4`}
              />
            </div>
            {errors.location && (
              <p className="text-red-400 text-[11px] mt-1">{errors.location}</p>
            )}
          </div>

          <div>
            <FieldLabel>Address</FieldLabel>
            <div className="relative">
              <Navigation
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="e.g. Warehouse Road, Apapa"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                className={`${INPUT_CLS()} pl-9 pr-4`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel required>Due Date</FieldLabel>
              <div className="relative">
                <Calendar
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => set('dueDate', e.target.value)}
                  className={`${INPUT_CLS(errors.dueDate)} pl-9 pr-4`}
                />
              </div>
              {errors.dueDate && (
                <p className="text-red-400 text-[11px] mt-1">{errors.dueDate}</p>
              )}
            </div>

            <div>
              <FieldLabel required>Priority</FieldLabel>
              <div className="relative">
                {form.priority ? (
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full pointer-events-none"
                    style={{ backgroundColor: PRIORITY_COLORS[form.priority as Priority] }}
                  />
                ) : (
                  <AlertCircle
                    size={13}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                )}
                <select
                  value={form.priority}
                  onChange={(e) => set('priority', e.target.value as Priority)}
                  className={`${INPUT_CLS(errors.priority)} pl-9 pr-4 appearance-none cursor-pointer`}
                >
                  <option value="" disabled>
                    Select
                  </option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              {errors.priority && (
                <p className="text-red-400 text-[11px] mt-1">{errors.priority}</p>
              )}
            </div>
          </div>

          <div>
            <FieldLabel>Required Actions</FieldLabel>
            <textarea
              placeholder="e.g. Take photos, confirm route"
              value={form.requiredActions}
              onChange={(e) => set('requiredActions', e.target.value)}
              rows={2}
              className={`${BASE_INPUT} py-2.5 px-4 resize-none border-gray-200 focus:border-[#094B5C]`}
            />
            <p className="text-[10px] text-gray-400 mt-1">Comma-separated</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Min. Photos</FieldLabel>
              <input
                type="number"
                min={0}
                max={20}
                placeholder="0"
                value={form.minPhotos}
                onChange={(e) => set('minPhotos', e.target.value)}
                className={`${INPUT_CLS()} px-4`}
              />
            </div>

            <div>
              <FieldLabel>Visit Verification</FieldLabel>
              <div
                onClick={() => set('visitVerification', !form.visitVerification)}
                className={`mt-1 flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 cursor-pointer transition-all select-none ${
                  form.visitVerification
                    ? 'bg-[#09232d] border-[#0B1215]'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${form.visitVerification ? 'bg-white/20' : 'bg-gray-300'}`}
                >
                  <div
                    className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-all ${
                      form.visitVerification ? 'left-4 bg-white' : 'left-0.5 bg-white'
                    }`}
                  />
                </div>
                <span
                  className={`text-[12px] font-bold ${form.visitVerification ? 'text-white' : 'text-gray-500'}`}
                >
                  {form.visitVerification ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 shrink-0 border-t border-gray-100">
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="w-full py-3 bg-[#09232d] text-white rounded-2xl text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-60"
          >
            {isPending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle size={15} />}
            {isPending ? 'Creating…' : 'Create Self-Task'}
          </button>
        </div>
      </div>
    </div>
  );
}
