'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DndItem } from '@/types/operations';
import { Maximize2 } from 'lucide-react';

interface TaskCardProps {
  item: DndItem;
  onClick?: (item: DndItem) => void;
}

export function TaskCard({ item, onClick }: TaskCardProps) {
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
        bg-white rounded-[32px] p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col gap-6
        cursor-pointer transition-all duration-200 select-none mb-3
        ${isDragging ? 'opacity-50 scale-105 z-50 shadow-xl cursor-grabbing' : 'hover:shadow-md hover:-translate-y-0.5'}
      `}
      onClick={() => onClick?.(item)}
    >
      <div>
        <h4 className="text-[#0B1215] font-bold text-[17px] tracking-tight">{item.label}</h4>
        <p className="text-gray-400 text-[13px] mt-1">{item.description}</p>
      </div>

      <div className="space-y-2.5">
        <span className="text-[#0B1215] font-bold text-[15px] block">Location</span>
        <div className="flex items-start justify-between gap-3">
          <span className="text-gray-500 text-[12px] underline decoration-gray-300 underline-offset-4 leading-relaxed flex-1">
            {item.location}
          </span>
          <div className="flex flex-col items-end gap-2.5 shrink-0">
            <button 
              onClick={(e) => { e.stopPropagation(); /* Map action */ }}
              className="bg-[#D15FE2] text-white text-[10px] font-semibold px-3 py-1.5 rounded-full hover:bg-[#B14FC2] transition-colors"
            >
              View on Map
            </button>
            <span className="text-gray-400 text-[11px]">{item.time}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
