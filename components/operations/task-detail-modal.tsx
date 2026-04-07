'use client';

import React from 'react';
import { X, MapPin, Share2, RefreshCw, CheckCircle } from 'lucide-react';
import type { DndItem } from '@/types/operations';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: DndItem | null;
  status: 'pending' | 'in-progress' | 'completed' | string;
}

export function TaskDetailModal({ isOpen, onClose, task, status }: TaskDetailModalProps) {
  if (!isOpen || !task) return null;

  const isPending = status === 'pending';
  const isInProgress = status === 'in-progress';
  const isCompleted = status === 'completed';

  const statusConfig = {
    pending: { bg: '#FF9F6A', text: 'white', label: 'Pending' },
    'in-progress': { bg: '#3B63F8', text: 'white', label: 'In-Progress' },
    completed: { bg: '#4FD1C5', text: 'white', label: 'Completed' },
  };

  const currentStatus = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  // Format addedDescription: split by newline, render each line
  const descriptionLines = (task.addedDescription || '').split('\n').filter(Boolean);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-215 bg-white rounded-[40px] shadow-2xl overflow-hidden z-10 flex flex-col" style={{ maxHeight: '90vh' }}>

        {/* ── Map Section ──────────────────────────────────────────────── */}
        <div className="relative h-55 w-full bg-[#eef0f3] overflow-hidden shrink-0">

          {/* Grid lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
            <defs>
              <pattern id="grid" width="80" height="60" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 60" fill="none" stroke="#CBD5E1" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Street labels */}
          <div className="absolute left-50 top-0 bottom-0 flex flex-col justify-center gap-1 pointer-events-none">
            <span className="text-[11px] font-semibold text-gray-400 -rotate-90 origin-center whitespace-nowrap">Dresd</span>
            <span className="text-[11px] font-semibold text-gray-400 -rotate-90 origin-center whitespace-nowrap">Stree</span>
          </div>

          {/* Route line */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            <path
              d="M340 160 C380 165 430 158 470 135 C490 122 500 135 590 135 C630 135 650 140 670 150"
              stroke="#3B82F6"
              strokeWidth="10"
              strokeLinecap="round"
              fill="none"
            />
          </svg>

          {/* Origin pin */}
          <div className="absolute" style={{ left: 328, top: 120 }}>
            <MapPin size={22} className="text-red-500 fill-red-500 drop-shadow-md" />
          </div>

          {/* Agent marker */}
          <div className="absolute flex flex-col items-center" style={{ left: 318, top: 142 }}>
            <div className="w-9 h-9 rounded-full border-[3px] border-white shadow-lg overflow-hidden">
              <img
                src={task.avatar || 'https://i.pravatar.cc/150?u=lane'}
                className="w-full h-full object-cover"
                alt="Agent"
              />
            </div>
            <div className="bg-[#B7E4C7] px-2.5 py-0.5 rounded-full mt-1 shadow-sm text-center whitespace-nowrap">
              <p className="text-[9px] font-bold text-[#2D6A4F]">Lane Wade</p>
              <p className="text-[8px] text-[#2D6A4F]/70">Active at Kemsi Street</p>
            </div>
          </div>

          {/* Mid waypoint */}
          <div className="absolute" style={{ left: 468, top: 120 }}>
            <div className="w-7 h-7 bg-[#3B82F6] rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              <Share2 size={12} className="text-white fill-white" />
            </div>
          </div>

          {/* Destination marker */}
          <div className="absolute" style={{ left: 658, top: 132 }}>
            <div className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-lg border-4 border-[#C77DFF]/40">
              <div className="w-2.5 h-2.5 bg-[#9D4EDD] rounded-full" />
            </div>
          </div>

          {/* Business card overlay — top right */}
          <div className="absolute top-4 right-16 flex rounded-[14px] overflow-hidden shadow-xl bg-white" style={{ width: 200 }}>
            <div className="w-16 h-16 shrink-0 bg-gray-200 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=200&q=80"
                className="w-full h-full object-cover"
                alt="Location"
              />
            </div>
            <div className="flex-1 px-2.5 py-2 min-w-0">
              <p className="text-[11px] font-bold text-dash-dark truncate">Company Name</p>
              <p className="text-[10px] text-gray-400 leading-snug mt-0.5">London SE1 2UF, UK</p>
            </div>
          </div>

          {/* Status badge — overlaps business card top-right */}
          <div
            className="absolute top-3 right-3 px-4 py-1.5 rounded-xl text-[12px] font-bold shadow-md z-20"
            style={{ backgroundColor: currentStatus.bg, color: currentStatus.text }}
          >
            {currentStatus.label}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-9 h-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 transition-all shadow-md z-30"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Content Section ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-10 py-8">
          <div className="grid grid-cols-2 gap-12">

            {/* Left column */}
            <div className="space-y-7">
              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Task Title</h3>
                <p className="text-[14px] text-gray-500 leading-snug">
                  {task.description || 'Cover the entirety of Ikeja, For our product publicity'}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Location</h3>
                <p className="text-[14px] text-gray-500 underline decoration-gray-300 underline-offset-4 leading-relaxed mb-3">
                  {task.location}
                </p>
                <button className="px-4 py-1.5 bg-dash-teal/15 text-[#3A8C88] rounded-full text-[12px] font-semibold hover:bg-dash-teal/25 transition-colors">
                  View on Full Map
                </button>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Due Date</h3>
                <p className="text-[14px] text-gray-400">
                  {task.dueDate || 'Tomorrow (Friday, 3rd April. 2026)'}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Assigned By</h3>
                <p className="text-[14px] text-gray-400">
                  {task.assignedBy || 'Ridwan Thomson (Supervisor)'}
                </p>
              </section>
            </div>

            {/* Right column */}
            <div className="flex flex-col">
              <section className="mb-6">
                <h3 className="text-[15px] font-bold text-dash-dark mb-2">Added Description</h3>
                <div className="text-[13px] text-gray-500 leading-relaxed space-y-1">
                  {descriptionLines.length > 0
                    ? descriptionLines.map((line, i) => (
                        <p key={i}>{line}</p>
                      ))
                    : (
                      <>
                        <p>Visit the Ikeja Computer village, and promote (product name) to the target audience there.</p>
                        <p className="mt-2">Speak with the business owner and note:</p>
                        <p>- Contact Details</p>
                        <p>- Prospect brief</p>
                        <p>- Any other usable details.</p>
                      </>
                    )
                  }
                </div>
              </section>

              {/* In-progress: note + actions */}
              {isInProgress && (
                <div className="space-y-4 mt-1">
                  <section>
                    <h3 className="text-[15px] font-bold text-dash-dark mb-2">Add Note</h3>
                    <div className="relative">
                      <textarea
                        placeholder="Type your note here ..."
                        className="w-full h-28 bg-dash-bg rounded-[18px] px-5 py-4 text-[13px] text-dash-dark outline-none border border-transparent focus:border-gray-200 resize-none placeholder:text-gray-300"
                      />
                      <span className="absolute bottom-4 right-5 text-[10px] text-gray-300 font-medium">Optional</span>
                    </div>
                  </section>
                  <div className="flex gap-3">
                    <button className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 bg-white border-2 border-gray-100 rounded-[18px] text-[13px] font-semibold text-gray-400 hover:bg-gray-50 transition-all">
                      Upload Photo
                      <div className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center ml-1">
                        <RefreshCw size={12} className="text-gray-400" />
                      </div>
                    </button>
                    <button className="flex-1 flex items-center justify-center px-5 py-3.5 bg-[#7EB5AE] text-white rounded-[18px] text-[13px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all">
                      Task Done
                    </button>
                  </div>
                </div>
              )}

              {/* Pending: commence button */}
              {isPending && (
                <div className="mt-auto pt-6">
                  <button className="w-full flex items-center justify-center px-8 py-4 bg-[#7EB5AE] text-white rounded-[20px] text-[15px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all">
                    Commence Task
                  </button>
                </div>
              )}

              {/* Completed */}
              {isCompleted && (
                <div className="mt-auto pt-6">
                  <div className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-dash-teal/10 text-dash-teal rounded-[20px] text-[15px] font-semibold border border-dash-teal/20">
                    <CheckCircle size={20} />
                    Task Completed
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
