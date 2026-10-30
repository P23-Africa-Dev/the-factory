'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Settings2, Route, Users, Navigation, ArrowLeft } from 'lucide-react';
import {
  FieldActivitySummaryCard,
  useFieldActivityLive,
  useFieldActivityAnalytics,
  useFieldActivitySettings,
  useUpdateFieldActivitySettings,
} from '@/features/field-activity';
import { toast } from '@/lib/toast';
import { showApiErrorToast } from '@/lib/api/errors';

function formatKm(meters: number): string {
  if (!meters || meters <= 0) return '0 km';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function ManagerFieldActivityPage(): React.ReactElement {
  const router = useRouter();
  const { data: liveData } = useFieldActivityLive();
  const { data: analytics } = useFieldActivityAnalytics();
  const { data: settings } = useFieldActivitySettings();
  const updateSettingsMutation = useUpdateFieldActivitySettings();

  const [showSettings, setShowSettings] = useState(false);

  const liveAgents = liveData ?? [];

  const handleToggleTracking = async (enabled: boolean) => {
    try {
      await updateSettingsMutation.mutateAsync({ enabled });
      toast.success(`Field activity tracking ${enabled ? 'enabled' : 'paused'} for organization.`);
    } catch (err) {
      showApiErrorToast(err, 'Could not update field activity settings');
    }
  };

  return (
    <main className="min-h-screen bg-[#0A1D25] text-white pb-24 pt-[calc(env(safe-area-inset-top,0px)+20px)] font-sans">
      <header className="px-5 mb-4">
        <div className="flex items-center gap-2 mb-2 text-[#75ADAF]">
          <ArrowLeft size={16} />
          <Link href="/" className="text-xs font-bold uppercase tracking-wider">
            Back to Dashboard
          </Link>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">Team Field Activity</h1>
            <p className="mt-1 text-xs text-[#8F9098]">
              Monitor live agent journeys, total field distance, client visits, and stop analytics.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="p-2 rounded-full bg-white/5 border border-white/10 text-white/80 hover:text-white"
              title="Field Activity Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <Link
              href="/field-activity/journeys"
              className="rounded-full bg-[#75ADAF]/20 border border-[#75ADAF]/40 px-3 py-1.5 text-xs font-semibold text-[#75ADAF]"
            >
              Agent Journeys
            </Link>
          </div>
        </div>
      </header>

      {/* Organization Field Activity Settings Drawer */}
      {showSettings && (
        <div className="mx-5 mb-4 p-4 rounded-2xl bg-[#0B3343] border border-white/10 shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                Automatic Journey Tracking
              </h3>
              <p className="text-[11px] text-white/60 mt-0.5">
                Record agent breadcrumb trails and stop clusters when clocked in.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleTracking(!(settings?.enabled ?? true))}
              disabled={updateSettingsMutation.isPending}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                (settings?.enabled ?? true)
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white/10 text-white/60'
              }`}
            >
              {(settings?.enabled ?? true) ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>
      )}

      {/* Summary Card */}
      <FieldActivitySummaryCard />

      {/* Team Analytics Breakdown */}
      <section className="px-5 mt-5">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-[#75ADAF]" />
              Live Field Agents ({liveAgents.length})
            </h2>
            <Link
              href="/map"
              className="text-[11px] font-semibold text-[#FD6046] hover:underline"
            >
              Open Live Map →
            </Link>
          </div>

          {liveAgents.length === 0 ? (
            <p className="text-xs text-white/50 py-6 text-center">
              No active field journeys right now. Tap &ldquo;Agent Journeys&rdquo; above to inspect historical logs.
            </p>
          ) : (
            <div className="space-y-2.5">
              {liveAgents.map((item, idx) => {
                const userId = Number(item.user_id ?? idx);
                const name = String(item.agent_name ?? `Agent #${userId}`);
                const dist = Number(item.distance_meters ?? 0);
                const stops = Number(item.stop_count ?? 0);
                return (
                  <div
                    key={userId}
                    onClick={() => router.push(`/field-activity/journeys?userId=${userId}`)}
                    className="p-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between gap-3 cursor-pointer transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-[#1D7293] text-white font-bold text-xs flex items-center justify-center shrink-0">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{name}</p>
                        <p className="text-[11px] text-white/60">
                          {formatKm(dist)} traveled · {stops} stops
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-[#75ADAF]/20 text-[#75ADAF] text-[10px] font-bold flex items-center gap-1 shrink-0">
                      <Route className="w-3 h-3" /> Journeys
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {analytics && (
        <section className="px-5 mt-4 grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
              Team Distance
            </span>
            <p className="text-lg font-black text-white mt-1 flex items-center gap-1.5">
              <Navigation className="w-4 h-4 text-emerald-400" />
              {formatKm(Number(analytics.distance_meters ?? 0))}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
            <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold">
              Verified Visits
            </span>
            <p className="text-lg font-black text-white mt-1">
              {Number(analytics.visit_count ?? 0)} Visits
            </p>
          </div>
        </section>
      )}
    </main>
  );
}
