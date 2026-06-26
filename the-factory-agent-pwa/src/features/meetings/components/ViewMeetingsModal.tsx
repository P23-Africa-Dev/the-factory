'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MeetingListItem } from './MeetingListItem';
import { useMeetingNavigation } from '../navigation';
import type { Meeting } from '../types';

interface ViewMeetingsModalProps {
  open: boolean;
  onClose: () => void;
  date: Date;
  meetings: Meeting[];
  onScheduleNew?: () => void;
}

export function ViewMeetingsModal({
  open,
  onClose,
  date,
  meetings,
  onScheduleNew,
}: ViewMeetingsModalProps): React.ReactElement {
  const nav = useMeetingNavigation();

  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleMeetingClick = (id: number | string) => {
    onClose();
    nav.goToMeetingDetail(id);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 font-sans">
          <div className="absolute inset-0 z-0" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative z-10 w-full max-w-md max-h-[85vh] bg-[#0A1D25] rounded-t-[28px] border-t border-white/10 shadow-2xl flex flex-col"
          >
            {/* Drag Handle indicator for mobile aesthetic */}
            <div className="w-full pt-3 pb-1 flex flex-col items-center flex-shrink-0">
              <div className="w-12 h-1 bg-white/20 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="text-sm font-semibold text-[#75ADAF] hover:text-white transition-colors"
              >
                Close
              </button>
              <h3 className="font-bold text-base text-white">Daily Schedule</h3>
              {onScheduleNew ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onScheduleNew();
                  }}
                  className="text-sm font-semibold text-[#FD6046] hover:text-[#E0533C] transition-colors"
                >
                  Schedule
                </button>
              ) : (
                <div className="w-14" />
              )}
            </div>

            {/* Date Subtitle */}
            <div className="px-5 pt-4 pb-2 flex-shrink-0">
              <span className="text-[10px] uppercase tracking-wider text-[#75ADAF] font-bold">
                Schedule for
              </span>
              <h4 className="text-lg font-bold text-white mt-0.5">
                {formattedDate}
              </h4>
            </div>

            {/* Meetings List Content */}
            <div className="flex-1 overflow-y-auto px-5 py-2 pb-8">
              {meetings.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-16 h-16 bg-white/[0.04] border border-white/10 rounded-full flex items-center justify-center mb-4">
                    <span className="text-2xl">📅</span>
                  </div>
                  <h5 className="font-bold text-sm text-white">No Meetings Scheduled</h5>
                  <p className="text-xs text-white/50 mt-1 max-w-[240px] leading-relaxed">
                    You have a clear calendar for this day. Want to plan or schedule a new meeting?
                  </p>
                  {onScheduleNew && (
                    <button
                      onClick={() => {
                        onClose();
                        onScheduleNew();
                      }}
                      className="mt-5 px-5 py-2 bg-[#FD6046] hover:bg-[#E0533C] text-white text-xs font-semibold rounded-full shadow-md transition-all active:scale-95"
                    >
                      Schedule Meeting
                    </button>
                  )}
                </div>
              ) : (
                <div className="mt-2">
                  {meetings.map((meeting) => (
                    <MeetingListItem
                      key={meeting.id}
                      meeting={meeting}
                      onPress={handleMeetingClick}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
