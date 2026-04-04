'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DndItem } from '@/types/operations';
import { Maximize2 } from 'lucide-react';

interface TaskCardProps {
  item: DndItem;
}

export function TaskCard({ item }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        bg-white rounded-[20px] p-4 shadow-sm border border-gray-100 mb-3
        cursor-grab active:cursor-grabbing transition-all duration-200 select-none
        ${isDragging ? 'opacity-50 scale-105 z-50 shadow-xl' : 'hover:shadow-md hover:-translate-y-0.5'}
      `}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex-1 min-w-0 pr-2">
          <h4 className="text-[#0B1215] font-bold text-sm leading-tight">{item.label}</h4>
          <p className="text-gray-400 text-xs mt-0.5 leading-snug">{item.description}</p>
        </div>
        <Maximize2 size={16} className="text-gray-300 rotate-45 shrink-0 mt-0.5" />
      </div>

      <div className="space-y-2">
        <div>
          <span className="text-[#0B1215] font-bold text-xs block mb-1">Location</span>
          <div className="flex items-end justify-between gap-2">
            <span className="text-gray-400 text-[11px] underline decoration-gray-200 underline-offset-2 leading-snug flex-1">
              {item.location}
            </span>
            <button className="bg-[#D15FE2] text-white text-[9px] font-bold px-2.5 py-1.5 rounded-full hover:bg-[#B14FC2] transition-colors uppercase tracking-wider shrink-0 whitespace-nowrap">
              View on Map
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <span className="text-gray-400 text-[10px] font-medium">{item.time}</span>
        </div>
      </div>
    </div>
  );
}
