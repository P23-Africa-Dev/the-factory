'use client';

import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { DndItem } from '@/types/operations';
import { TaskCard } from './task-card';
import { Plus, Check, X } from 'lucide-react';

interface TaskColumnProps {
  id: string;
  title: string;
  color: string;
  items: DndItem[];
  onAddCard: (item: DndItem) => void;
}

export function TaskColumn({ id, title, color, items, onAddCard }: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: '', description: '', location: '' });
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!form.label.trim()) { setError('Name is required'); return; }
    onAddCard({
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: form.label.trim(),
      description: form.description.trim() || 'No description',
      location: form.location.trim() || 'Location not set',
      time: 'Just now',
    });
    setForm({ label: '', description: '', location: '' });
    setError('');
    setShowForm(false);
  };

  const handleCancel = () => {
    setForm({ label: '', description: '', location: '' });
    setError('');
    setShowForm(false);
  };

  return (
    <div className="flex flex-col min-w-0">
      {/* Column Header */}
      <div
        className="rounded-t-[24px] px-5 py-4 flex justify-between items-center"
        style={{ backgroundColor: color }}
      >
        <h3 className="text-white font-bold text-[15px]">{title}</h3>
        <div
          className="rounded-full w-7 h-7 flex items-center justify-center font-bold text-xs shadow-sm"
          style={{ backgroundColor: 'rgba(255,255,255,0.9)', color }}
        >
          {items.length}
        </div>
      </div>

      {/* Droppable Body */}
      <div
        ref={setNodeRef}
        className={`flex-1 p-3 rounded-b-[24px] -mt-3 z-10 relative transition-colors duration-200 min-h-[300px] ${
          isOver ? 'bg-gray-100 ring-2 ring-inset ring-gray-200' : 'bg-[#F4F7F9]'
        }`}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="pt-2">
            {items.map((item) => (
              <TaskCard key={item.id} item={item} />
            ))}
          </div>
        </SortableContext>

        {/* Inline Add Form */}
        {showForm && (
          <div className="bg-white rounded-[16px] p-4 shadow-md border border-gray-100 mb-3">
            <div className="space-y-2.5">
              <div>
                <input
                  type="text"
                  placeholder="Agent name *"
                  value={form.label}
                  autoFocus
                  onChange={(e) => { setForm((p) => ({ ...p, label: e.target.value })); setError(''); }}
                  className="w-full text-sm font-semibold text-[#0B1215] placeholder:text-gray-300 outline-none bg-transparent border-b border-gray-200 pb-1.5"
                />
                {error && <p className="text-red-400 text-[11px] mt-1">{error}</p>}
              </div>
              <input
                type="text"
                placeholder="Task description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full text-xs text-gray-500 placeholder:text-gray-300 outline-none bg-transparent border-b border-gray-100 pb-1.5"
              />
              <input
                type="text"
                placeholder="Location"
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                className="w-full text-xs text-gray-500 placeholder:text-gray-300 outline-none bg-transparent"
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#0B1215] text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
                >
                  <Check size={12} /> Save
                </button>
                <button
                  onClick={handleCancel}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Card Manually */}
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="w-full flex items-center justify-between px-2 py-3 text-gray-400 hover:text-[#0B1215] transition-colors group mt-1"
          >
            <span className="text-xs font-medium">Add Card Manually</span>
            <div className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center group-hover:border-[#0B1215] transition-colors">
              <Plus size={13} />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
