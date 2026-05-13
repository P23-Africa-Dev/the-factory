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
  const [selectedDate, setSelectedDate] = useState(6);
  // Hardcoded for screenshot match (March 2026)
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

  // Generate a range of days for the scrollable row
  // For the demo, we'll just show 1 to 31, but in a real app this might be more dynamic
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const getDayLabel = (day: number) => {
    const date = new Date(year, month, day);
    return DAY_LABELS[date.getDay()];
  };

  const isSelected = (day: number) => day === selectedDate;

  return (
    <div className="flex flex-col pt- relative min-h-[430px]">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 px-2">
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

      {/* Horizontal Scrollable Dates */}
      <div className="flex overflow-x-auto pb-4 mb-2 no-scrollbar gap-6 px-2">
        {days.map((day) => {
          const label = getDayLabel(day);
          const selected = isSelected(day);
          return (
            <div 
              key={day} 
              className="flex flex-col items-center min-w-[32px] cursor-pointer"
              onClick={() => setSelectedDate(day)}
            >
              <span className={`text-[13px] font-medium mb-3 transition-colors ${
                selected ? 'text-[#7EB5AE]' : 'text-gray-400'
              }`}>
                {label}
              </span>
              <div className={`w-8 h-8 text-[15px] flex items-center justify-center rounded-full transition-all ${
                selected
                  ? 'bg-[#F26442] text-white shadow-lg font-semibold'
                  : 'text-gray-300 font-medium hover:bg-gray-100 hover:text-[#094B5C]'
              }`}>
                {day}
              </div>
            </div>
          );
        })}
      </div>

      {/* Schedule Items */}
      <div className="space-y-2 mb-3">
        {SCHEDULE_ITEMS.map((item, idx) => (
          <div 
            key={idx} 
            className="rounded-[24px] px-6 py-2 flex items-center transition-transform hover:scale-[1.02] cursor-pointer" 
            style={{ 
              backgroundColor: item.bg, 
              boxShadow: `0 12px 24px ${item.shadow}` 
            }}
          >
            <div className="flex gap-6 items-center w-full">
              <span className="text-[12px] font-medium text-white w-14 shrink-0">
                {item.time}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-white leading-snug">
                  To: <span className="font-bold">{item.to}</span>
                </p>
                <p className="text-[12px] text-white/90 mt-1 leading-snug">{item.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Button (Floating) */}
      <div className="absolute bottom-[50px] right-2">
        <button className="w-8 h-8 border-[2px] border-[#7EB5AE] rounded-full flex items-center justify-center text-[#7EB5AE] hover:bg-[#7EB5AE] hover:text-white transition-all shadow-sm cursor-pointer">
          <Plus size={10} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
