"use client";

import type { OngoingAgent, OngoingTask } from "@/lib/api/dashboard";
import { resolveAvatarSrc } from "@/lib/avatar";
import {
  badgePositionPercent,
  buildLegacyOngoingSlides,
  buildOngoingSlides,
  firstName,
  ONGOING_ROTATE_MS,
  ONGOING_SOURCE_LABEL,
  ONGOING_STATE_LABEL,
} from "@/lib/dashboard-ongoing";
import { cn } from "@/lib/utils/sample";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

const STATE_CHIP_CLASS = {
  active: "bg-[#FD6046]/10 text-[#FD6046]",
  paused: "bg-gray-200 text-gray-600",
  near_destination: "bg-[#F5A623]/10 text-[#C77700]",
  arrived: "bg-[#7BB6B8]/15 text-[#3F7E80]",
} as const;

type Props = {
  agents?: OngoingAgent[];
  legacyTasks?: OngoingTask[];
  /** Agents rotate through their own tasks; managers rotate through agents. */
  isAgentView: boolean;
};

/**
 * Ongoing tasks bar. Managers: one slide per agent (average progress of their ongoing tasks).
 * Agents: one slide per own task. Rotates every few seconds; hover pauses; dots jump.
 */
export function OngoingTasksSlider({ agents, legacyTasks, isAgentView }: Props) {
  const slides = useMemo(
    () =>
      agents !== undefined
        ? buildOngoingSlides(agents, isAgentView)
        : buildLegacyOngoingSlides(legacyTasks),
    [agents, legacyTasks, isAgentView],
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = slides.length;
  const active = count > 0 ? slides[index % count] : null;

  useEffect(() => {
    if (count <= 1 || paused) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), ONGOING_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  const progress = active?.progress ?? 0;
  const badgeLeft = badgePositionPercent(progress);

  return (
    <div
      className="mb-4 relative px-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-medium text-[#34373C]">Ongoing tasks</p>
        {active ? (
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", STATE_CHIP_CLASS[active.state])}>
            {ONGOING_STATE_LABEL[active.state]}
          </span>
        ) : null}
      </div>

      {/* Track + badge */}
      <div className="relative mt-8">
        {active ? (
          <div
            key={`badge-${active.key}`}
            className="absolute -top-7 -translate-x-1/2 flex items-center gap-1 rounded-full bg-[#FD6046] pl-0.5 pr-2 py-0.5 text-white shadow-md transition-[left] duration-500"
            style={{ left: `${badgeLeft}%` }}
          >
            {active.agent.avatar_url ? (
              <Image
                src={resolveAvatarSrc(active.agent.avatar_url)}
                alt={active.agent.name}
                width={18}
                height={18}
                className="w-4.5 h-4.5 rounded-full object-cover bg-white"
                unoptimized
              />
            ) : (
              <span className="w-4.5 h-4.5 rounded-full bg-white text-[#FD6046] text-[8px] font-bold flex items-center justify-center">
                {active.agent.initials}
              </span>
            )}
            <span className="text-[10px] font-semibold whitespace-nowrap">
              {firstName(active.agent.name)} · {progress}%
            </span>
            <span className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-1.5 bg-[#FD6046] [clip-path:polygon(0%_0%,100%_0%,50%_100%)]" />
          </div>
        ) : null}

        <div className="w-full h-5 bg-[#F5F5F5] rounded-full p-1.5 shadow-inner ring-1 ring-dash-dark/5">
          <div
            className="h-full bg-[#FD6046] rounded-full shadow-lg transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {active ? (
        <div key={`caption-${active.key}`} className="mt-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate text-[#34373C]" title={active.caption}>
            {active.caption}
          </span>
          <span className="shrink-0 text-[10px] text-gray-400">{ONGOING_SOURCE_LABEL[active.source]}</span>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-gray-400">No ongoing tasks right now</p>
      )}

      {count > 1 ? (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {slides.map((slide, i) => (
            <button
              key={slide.key}
              type="button"
              aria-label={`Show ${slide.agent.name}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index % count ? "w-4 bg-[#FD6046]" : "w-1.5 bg-gray-300 hover:bg-gray-400",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
