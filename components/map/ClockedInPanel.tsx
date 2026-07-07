"use client";

import Link from "next/link";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Clock3 } from "lucide-react";
import type { AttendanceMapSnapshotItem } from "@/lib/api/attendance";
import { getAgentInitials } from "@/lib/tracking/map-visualization";

type ClockedInPanelProps = {
  items: AttendanceMapSnapshotItem[];
  isLoading?: boolean;
  selectedUserId: number | null;
  onSelect: (item: AttendanceMapSnapshotItem) => void;
  showAttendanceLink?: boolean;
};

export function ClockedInPanel({
  items,
  isLoading = false,
  selectedUserId,
  onSelect,
  showAttendanceLink = true,
}: ClockedInPanelProps) {
  if (isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <span className="w-5 h-5 border-2 border-gray-200 border-t-dash-teal rounded-full animate-spin" />
        <p className="text-[12px] text-gray-400">Loading clocked-in agents…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Clock3 size={24} className="text-gray-200" />
        <p className="text-[12px] text-gray-400">No agents clocked in today</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-2">
      {items.map((item) => {
        const isSelected = selectedUserId === item.user_id;
        const clockInLabel = item.clock_in_at
          ? format(parseISO(item.clock_in_at), "h:mm a")
          : "—";

        return (
          <button
            key={item.user_id}
            type="button"
            onClick={() => onSelect(item)}
            className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-all rounded-[20px] ${
              isSelected ? "bg-[#0A192F]" : "bg-[#F8FAFC] hover:bg-gray-100"
            }`}
          >
            <ClockInListAvatar
              name={item.agent_name}
              avatarUrl={item.avatar_url}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className={`text-[14px] font-bold truncate ${isSelected ? "text-white" : "text-dash-dark"}`}>
                  {item.agent_name}
                </p>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    item.is_late
                      ? isSelected
                        ? "bg-orange-500/20 text-orange-200"
                        : "bg-orange-50 text-orange-600"
                      : isSelected
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {item.is_late ? "Late" : "On time"}
                </span>
              </div>
              <p className={`text-[12px] truncate mt-0.5 ${isSelected ? "text-gray-400" : "text-gray-500"}`}>
                {item.address ?? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`}
              </p>
              <p className={`text-[11px] mt-1 ${isSelected ? "text-gray-500" : "text-gray-400"}`}>
                Clocked in {clockInLabel}
              </p>
            </div>
          </button>
        );
      })}

      {showAttendanceLink && (
        <Link
          href="/operations/attendance"
          className="block text-center text-[12px] font-semibold text-dash-teal pt-2"
        >
          View attendance records
        </Link>
      )}
    </div>
  );
}

function ClockInListAvatar({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = !!avatarUrl && !imageFailed;

  return (
    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border-2 border-white shadow-sm bg-gray-100 flex items-center justify-center">
      {showImage ? (
        <img
          src={avatarUrl}
          className="w-full h-full object-cover"
          alt={name}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="text-[12px] font-bold text-gray-500">{getAgentInitials(name)}</span>
      )}
    </div>
  );
}
