'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  X as XIcon,
  Calculator,
  Wallet,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import {
  usePayrollOverview,
  usePayrollAgents,
  useUpdatePayrollApproval,
} from '@/features/workforce/api';
import { useGeneratePayrollSummaryMutation } from '@/features/attendance';
import { useManagerPermissions } from '@/features/auth';
import { toast } from '@/lib/toast';
import { showApiErrorToast } from '@/lib/api/errors';

export default function ManagerPayrollPage() {
  const { canApprovePayroll } = useManagerPermissions();

  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7),
  );

  const { data: overview, isLoading: isLoadingOverview } = usePayrollOverview({
    month: selectedMonth,
  });
  const { data: agents = [], isLoading: isLoadingAgents } = usePayrollAgents({
    month: selectedMonth,
  });
  const approvalMutation = useUpdatePayrollApproval();
  const generateSummaryMutation = useGeneratePayrollSummaryMutation();

  const handleGenerateSummary = async () => {
    try {
      await generateSummaryMutation.mutateAsync({ month: selectedMonth });
      toast.success(`Generated attendance payroll summary for ${selectedMonth}.`);
    } catch (err) {
      showApiErrorToast(err, 'Could not generate payroll summary');
    }
  };

  const handleApproval = async (userId: number, name: string, status: 'approved' | 'rejected') => {
    try {
      await approvalMutation.mutateAsync({
        userId,
        status,
        month: selectedMonth,
      });
      toast.success(`${name}'s payroll marked as ${status}.`);
    } catch (err) {
      showApiErrorToast(err, 'Could not update payroll approval');
    }
  };

  return (
    <ScreenErrorBoundary screenName="ManagerPayroll">
      <div className="min-h-screen bg-[#0A1D25] text-white pb-24 pt-[calc(env(safe-area-inset-top,0px)+20px)] px-5 font-sans">
        {/* Back link */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-[#75ADAF]">
            <ArrowLeft size={16} />
            <Link href="/workforce" className="text-xs font-bold uppercase tracking-wider">
              Back to Workforce
            </Link>
          </div>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 rounded-xl bg-[#0B3343] border border-white/15 px-3 text-xs font-bold text-white focus:outline-none"
          />
        </div>

        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-extrabold text-white">Payroll &amp; Approvals</h1>
            <p className="text-xs text-white/60 mt-1">
              Review attendance hours, task completions, and approve monthly agent payouts.
            </p>
          </div>
          {canApprovePayroll && (
            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={generateSummaryMutation.isPending}
              className="px-3.5 py-2.5 rounded-xl bg-[#75ADAF] text-[#0A1D25] text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-lg"
            >
              <Calculator className="w-4 h-4" />
              {generateSummaryMutation.isPending ? 'Syncing…' : 'Sync Hours'}
            </button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-4 rounded-2xl bg-white/[0.06] border border-white/10">
            <div className="flex items-center justify-between text-white/50 text-[10px] font-bold uppercase">
              <span>Estimated Payout</span>
              <Wallet className="w-4 h-4 text-[#75ADAF]" />
            </div>
            <p className="text-xl font-black text-white mt-2">
              {isLoadingOverview
                ? '…'
                : `${overview?.currency ?? 'NGN'} ${(overview?.total_estimated_payout ?? 0).toLocaleString()}`}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white/[0.06] border border-white/10">
            <div className="flex items-center justify-between text-white/50 text-[10px] font-bold uppercase">
              <span>Approval Progress</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xl font-black text-white mt-2">
              {overview?.approved_count ?? 0} / {overview?.total_agents ?? agents.length} Approved
            </p>
          </div>
        </div>

        {/* Agent Payroll List */}
        <h2 className="text-sm font-bold text-white mb-3">
          Agent Payroll Sheet ({agents.length})
        </h2>

        {isLoadingAgents ? (
          <div className="py-16 flex justify-center">
            <div className="w-7 h-7 rounded-full border-3 border-[#75ADAF] border-t-transparent animate-spin" />
          </div>
        ) : agents.length === 0 ? (
          <div className="p-8 rounded-2xl bg-white/[0.04] border border-white/10 text-center text-xs text-white/50">
            No payroll records found for {selectedMonth}. Tap &ldquo;Sync Hours&rdquo; to compute from attendance.
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => {
              const status = agent.approval_status ?? 'pending';
              return (
                <div
                  key={agent.user_id}
                  className="p-4 rounded-2xl bg-white/[0.05] border border-white/10 flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-white">{agent.name}</h3>
                      <p className="text-[11px] text-white/50">
                        {agent.days_present ?? 0}d present · {agent.days_late ?? 0}d late ·{' '}
                        {agent.total_hours ?? 0}h logged
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : status === 'rejected'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-center">
                    <div>
                      <span className="text-[9px] uppercase text-white/40 block">Base</span>
                      <span className="text-xs font-bold text-white">
                        {(agent.base_pay ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-white/40 block">Bonus</span>
                      <span className="text-xs font-bold text-emerald-400">
                        +{(agent.bonus_pay ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] uppercase text-white/40 block">Net Pay</span>
                      <span className="text-xs font-black text-[#75ADAF]">
                        {agent.currency ?? 'NGN'} {(agent.net_pay ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {canApprovePayroll && (
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleApproval(agent.user_id, agent.name, 'approved')}
                        disabled={approvalMutation.isPending || status === 'approved'}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-1 disabled:opacity-40"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApproval(agent.user_id, agent.name, 'rejected')}
                        disabled={approvalMutation.isPending || status === 'rejected'}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1 disabled:opacity-40"
                      >
                        <XIcon className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ScreenErrorBoundary>
  );
}

