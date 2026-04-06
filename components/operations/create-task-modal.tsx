'use client';

import React, { useState } from 'react';
import { X, MapPin, User, FileText, CheckCircle, ChevronDown } from 'lucide-react';
import type { DndItem, TaskCategory } from '@/types/operations';

type StatusType = 'pending' | 'in-progress' | 'completed';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask: (containerId: StatusType, item: DndItem) => void;
}

const STATUS_OPTIONS: { value: StatusType; label: string; color: string; short: string }[] = [
  { value: 'pending', label: 'Pending Task', color: '#BD7A22', short: 'Pending' },
  { value: 'in-progress', label: 'In Progress', color: '#094B5C', short: 'In Progress' },
  { value: 'completed', label: 'Completed', color: '#4FD1C5', short: 'Completed' },
];

const CATEGORY_OPTIONS: { value: TaskCategory; label: string }[] = [
  { value: 'all', label: 'General' },
  { value: 'agent', label: 'Agent' },
  { value: 'attendance', label: 'Attendance' },
];

export function CreateTaskModal({ isOpen, onClose, onCreateTask }: CreateTaskModalProps) {
  const [form, setForm] = useState({
    label: '',
    description: '',
    location: '',
    status: 'pending' as StatusType,
    category: 'all' as TaskCategory,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.label.trim()) errs.label = 'Agent name is required';
    if (!form.description.trim()) errs.description = 'Description is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const newItem: DndItem = {
      id: `task-${Date.now()}`,
      label: form.label.trim(),
      description: form.description.trim(),
      location: form.location.trim() || 'Location not specified',
      time: 'Just now',
      category: form.category,
    };
    onCreateTask(form.status, newItem);
    handleClose();
  };

  const handleClose = () => {
    setForm({ label: '', description: '', location: '', status: 'pending', category: 'all' });
    setErrors({});
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div className="relative w-full max-w-md bg-white rounded-[28px] shadow-2xl overflow-hidden z-10 animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div className="bg-[#0B1215] px-6 py-5 flex justify-between items-center">
          <div>
            <h2 className="text-white font-bold text-base">Create New Task</h2>
            <p className="text-gray-400 text-xs mt-0.5">Add a new task to your board</p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Agent Name */}
          <div>
            <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5">
              Agent Name *
            </label>
            <div className="relative">
              <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Enter agent name"
                value={form.label}
                onChange={(e) => { setForm((p) => ({ ...p, label: e.target.value })); setErrors((p) => ({ ...p, label: '' })); }}
                className={`w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm text-[#0B1215] outline-none border transition-colors placeholder:text-gray-300 ${
                  errors.label ? 'border-red-300' : 'border-gray-200 focus:border-[#094B5C]'
                }`}
              />
            </div>
            {errors.label && <p className="text-red-400 text-[11px] mt-1">{errors.label}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5">
              Task Description *
            </label>
            <div className="relative">
              <FileText size={13} className="absolute left-3 top-3 text-gray-400" />
              <textarea
                placeholder="Describe the task..."
                value={form.description}
                onChange={(e) => { setForm((p) => ({ ...p, description: e.target.value })); setErrors((p) => ({ ...p, description: '' })); }}
                rows={3}
                className={`w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm text-[#0B1215] outline-none border resize-none transition-colors placeholder:text-gray-300 ${
                  errors.description ? 'border-red-300' : 'border-gray-200 focus:border-[#094B5C]'
                }`}
              />
            </div>
            {errors.description && <p className="text-red-400 text-[11px] mt-1">{errors.description}</p>}
          </div>

          {/* Location */}
          <div>
            <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5">
              Location
            </label>
            <div className="relative">
              <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Enter location"
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                className="w-full pl-9 pr-4 py-2.5 bg-gray-50 rounded-xl text-sm text-[#0B1215] outline-none border border-gray-200 focus:border-[#094B5C] transition-colors placeholder:text-gray-300"
              />
            </div>
          </div>

          {/* Task Status */}
          <div>
            <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-2">
              Task Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm((p) => ({ ...p, status: opt.value }))}
                  className={`py-2.5 px-2 rounded-xl text-[11px] font-bold transition-all border-2 ${
                    form.status === opt.value
                      ? 'text-white shadow-md border-transparent'
                      : 'text-gray-500 border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                  style={form.status === opt.value ? { backgroundColor: opt.color, borderColor: opt.color } : {}}
                >
                  {opt.short}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-2">
              Category
            </label>
            <div className="flex gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setForm((p) => ({ ...p, category: opt.value }))}
                  className={`flex-1 py-2 px-3 rounded-xl text-[11px] font-bold transition-all border-2 ${
                    form.category === opt.value
                      ? 'bg-[#0B1215] text-white border-[#0B1215]'
                      : 'text-gray-500 border-gray-200 bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            className="w-full py-3 bg-[#0B1215] text-white rounded-2xl text-sm font-bold hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 mt-2"
          >
            <CheckCircle size={15} />
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}
