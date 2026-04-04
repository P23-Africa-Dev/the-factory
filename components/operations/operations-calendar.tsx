'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, MoreVertical } from 'lucide-react';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const SCHEDULE_ITEMS = [
  { time: '9 am', to: 'Lane wade', desc: 'Lorem ipsum dolor sit amet consectetur.', bg: 'rgba(79,209,197,0.25)' },
  { time: '2 pm', to: 'Bayo Williams', desc: 'Lorem ipsum dolor sit amet consectetur.', bg: 'rgba(209,95,226,0.25)' },
];

export function OperationsCalendar() {
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isToday = (d: number | null) =>
    d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div className="bg-white rounded-[28px] p-5 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex justify-between items-center mb-5">
        <h3 className="text-[#0B1215] font-bold text-sm">Schedule Self Task</h3>
        <MoreVertical size={16} className="text-gray-400 cursor-pointer" />
      </div>

      {/* Month Nav */}
      <div className="flex justify-between items-center mb-3">
        <button
          onClick={prevMonth}
          className="p-1.5 text-gray-400 hover:text-[#0B1215] transition-colors rounded-full hover:bg-gray-100"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="font-bold text-[#0B1215] text-xs">
          {MONTHS[month]}, {year}
        </span>
        <button
          onClick={nextMonth}
          className="p-1.5 text-gray-400 hover:text-[#0B1215] transition-colors rounded-full hover:bg-gray-100"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* Day Labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 mb-4">
        {cells.map((day, idx) => (
          <div key={idx} className="flex items-center justify-center py-0.5">
            {day ? (
              <button
                className={`w-7 h-7 text-[11px] font-semibold flex items-center justify-center rounded-full transition-all ${
                  isToday(day)
                    ? 'bg-[#FF7E5F] text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-[#0B1215]'
                }`}
              >
                {day}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Schedule Items */}
      <div className="space-y-2.5">
        {SCHEDULE_ITEMS.map((item, idx) => (
          <div key={idx} className="rounded-2xl px-3 py-2.5" style={{ backgroundColor: item.bg }}>
            <div className="flex gap-2.5 items-start">
              <span className="text-[10px] font-bold text-[#0B1215]/60 mt-0.5 w-8 shrink-0">
                {item.time}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#0B1215] leading-tight">
                  To: <span className="font-semibold">{item.to}</span>
                </p>
                <p className="text-[10px] text-[#0B1215]/50 mt-0.5 leading-tight">{item.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Button */}
      <div className="flex justify-end mt-4">
        <button className="w-9 h-9 bg-[#4FD1C5] rounded-full flex items-center justify-center text-white shadow-md hover:bg-[#3CB3A9] transition-colors">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
