'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, MoreVertical } from 'lucide-react';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const SCHEDULE_ITEMS = [
  { time: '9 am', to: 'Lane wade', desc: 'Lorem ipsum dolor sit amet consectetur.', bg: '#7EB5AE', shadow: 'rgba(126,181,174,0.4)' },
  { time: '2 pm', to: 'Bayo Williams', desc: 'Lorem ipsum dolor sit amet consectetur.', bg: '#E1A6E7', shadow: 'rgba(225,166,231,0.4)' },
];

export function OperationsCalendar() {
  const today = new Date();
  // Hardcoded for screenshot match (March 2026, 6th is highlighted)
  const [month, setMonth] = useState(2); // March is 2
  const [year, setYear] = useState(2026);

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

  const isToday = (d: number | null) => d === 6 && month === 2 && year === 2026;

  return (
    <div className="flex flex-col pt-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-10 px-2">
        <h3 className="text-[#094B5C] font-extrabold text-[17px] tracking-tight">Schedule Self Task</h3>
        <MoreVertical size={20} className="text-[#094B5C] cursor-pointer" strokeWidth={2.5} />
      </div>

      {/* Month Nav */}
      <div className="flex justify-center items-center mb-8 gap-12">
        <button
          onClick={prevMonth}
          className="p-1 text-gray-300 hover:text-[#094B5C] transition-colors"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <span className="font-semibold text-[#094B5C] text-[17px]">
          {MONTHS[month]}, {year}
        </span>
        <button
          onClick={nextMonth}
          className="p-1 text-gray-300 hover:text-[#094B5C] transition-colors"
        >
          <ChevronRight size={20} strokeWidth={2} />
        </button>
      </div>

      {/* Day Labels */}
      <div className="grid grid-cols-7 mb-4 px-2">
        {DAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-[13px] font-medium text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-y-4 px-2 mb-8">
        {cells.map((day, idx) => (
          <div key={idx} className="flex items-center justify-center">
            {day ? (
              <button
                className={`w-8 h-8 text-[15px] flex items-center justify-center rounded-full transition-all ${
                  isToday(day)
                    ? 'bg-[#F26442] text-white shadow-md font-semibold'
                    : 'text-gray-300 font-medium hover:bg-gray-100 hover:text-[#094B5C]'
                }`}
              >
                {day}
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {/* Schedule Items */}
      <div className="space-y-4 mb-3">
        {SCHEDULE_ITEMS.map((item, idx) => (
          <div 
            key={idx} 
            className="rounded-[16px] px-6 py-4 flex items-center" 
            style={{ 
              backgroundColor: item.bg, 
              boxShadow: `0 8px 16px ${item.shadow}` 
            }}
          >
            <div className="flex gap-4 items-center w-full">
              <span className="text-[14px] font-medium text-white w-12 shrink-0">
                {item.time}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-white leading-tight">
                  To: <span className="font-bold">{item.to}</span>
                </p>
                <p className="text-[11px] text-white/90 mt-0.5 leading-tight">{item.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Button */}
      <div className="flex justify-end mt-2 pr-1">
        <button className="w-8 h-8 border-[1.5px] border-[#7EB5AE] rounded-full flex items-center justify-center text-[#7EB5AE] hover:bg-[#7EB5AE] hover:text-white transition-colors">
          <Plus size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
