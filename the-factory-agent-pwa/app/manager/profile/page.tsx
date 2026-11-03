'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Wallet, Route, Building2 } from 'lucide-react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import {
  useProfile,
  useAuth,
  useAuthNavigation,
  useManagerIdentity,
  useManagerPermissions,
  useCompanySettings,
  useUpdateCompanySettingsMutation,
} from '@/features/auth';
import { toast } from '@/lib/toast';
import { showApiErrorToast } from '@/lib/api/errors';

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = status?.toLowerCase() ?? 'active';
  const isActive = s === 'active';
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${
        isActive
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
      }`}
    >
      {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active'}
    </span>
  );
}

function RoleBadge({
  role,
  variant = 'neutral',
}: {
  role: string | null | undefined;
  variant?: 'primary' | 'secondary' | 'neutral';
}) {
  if (!role) return null;
  const label = role.replace(/_/g, ' ').toUpperCase();

  const styles = {
    primary: 'bg-[#75ADAF]/20 text-[#75ADAF] border-[#75ADAF]/40',
    secondary: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    neutral: 'bg-white/10 text-white/80 border-white/20',
  };

  return (
    <span className={`px-3 py-1 rounded-full border text-[10px] font-bold tracking-wide ${styles[variant]}`}>
      {label}
    </span>
  );
}

export default function ProfilePage() {
  const { goBack } = useAuthNavigation();
  const { user } = useAuth();
  const { avatarSrc, roleLabel } = useManagerIdentity();
  const { canEditCompanySettings } = useManagerPermissions();
  const { data: profile, isLoading, isError, refetch } = useProfile();
  const { data: companySettings } = useCompanySettings();
  const updateCompanySettingsMutation = useUpdateCompanySettingsMutation();

  const [companyNameInput, setCompanyNameInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [teamSizeInput, setTeamSizeInput] = useState('');

  useEffect(() => {
    if (companySettings) {
      setTimeout(() => {
        setCompanyNameInput(String(companySettings.company_name ?? companySettings.name ?? ''));
        setCountryInput(String(companySettings.country ?? ''));
        setTeamSizeInput(String(companySettings.team_size ?? ''));
      }, 0);
    }
  }, [companySettings]);

  const identity = profile?.identity;
  const org = profile?.organization;
  const account = profile?.account;
  const perms = profile?.permissions;

  const displayName = identity?.name ?? user?.name ?? 'Manager';
  const displayEmail = identity?.email ?? user?.email ?? '';
  const accessRole = perms?.access_role ?? user?.accessRole ?? roleLabel;
  const internalRole = perms?.internal_role ?? user?.internalRole;
  const companyName = org?.company_name;
  const isActive = account?.status?.toLowerCase() === 'active';
  const isEmailVerified = account?.email_verified === true;
  const hasProfileData = Boolean(identity || org || account);

  const handleSaveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateCompanySettingsMutation.mutateAsync({
        company_name: companyNameInput.trim() || undefined,
        country: countryInput.trim() || undefined,
        team_size: teamSizeInput.trim() || undefined,
      });
      toast.success('Company settings updated');
    } catch (err) {
      showApiErrorToast(err, 'Failed to update company settings');
    }
  };

  return (
    <ScreenErrorBoundary screenName="Profile">
      <div className="flex flex-col min-h-screen bg-[#0A1D25] text-white">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-4 bg-[#0A1D25]/90 backdrop-blur border-b border-white/10">
          <button
            onClick={goBack}
            className="flex items-center gap-2 text-sm text-[#75ADAF] hover:text-white transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-base font-semibold">Profile &amp; Settings</h1>
          <div className="w-12" />
        </div>

        <div className="flex-1 px-4 py-6 space-y-6 max-w-lg mx-auto w-full pb-28">
          {/* Avatar and Identity */}
          <div className="flex flex-col items-center text-center space-y-3 pt-2">
            <div className="relative">
              <img
                src={avatarSrc}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover border-2 border-[#75ADAF]/60 bg-white/10 shadow-lg"
              />
              <span
                className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-[#0A1D25] ${
                  isActive ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
            </div>
            <div>
              <h2 className="text-xl font-bold">{displayName}</h2>
              <p className="text-sm text-white/60">{displayEmail}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <RoleBadge role={accessRole} variant="primary" />
              {internalRole && internalRole !== accessRole && (
                <RoleBadge role={internalRole} variant="secondary" />
              )}
              <StatusBadge status={account?.status} />
            </div>
          </div>

          {/* Quick links to Manager Panels */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Link
              href="/manager/workforce"
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="p-2 rounded-xl bg-[#75ADAF]/20 text-[#75ADAF]">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs text-white/50">Team</p>
                <p className="text-sm font-semibold">Workforce</p>
              </div>
            </Link>

            <Link
              href="/manager/payroll"
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                <Wallet className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs text-white/50">Finance</p>
                <p className="text-sm font-semibold">Payroll</p>
              </div>
            </Link>

            <Link
              href="/manager/field-activity"
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400">
                <Route className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs text-white/50">Field</p>
                <p className="text-sm font-semibold">Activity</p>
              </div>
            </Link>

            <Link
              href="/manager/crm"
              className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            >
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xs text-white/50">Sales</p>
                <p className="text-sm font-semibold">CRM Leads</p>
              </div>
            </Link>
          </div>

          {/* Company Info */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
              Organization
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-1 border-b border-white/5 text-sm">
                <span className="text-white/60">Company</span>
                <span className="font-semibold text-right">{companyName ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5 text-sm">
                <span className="text-white/60">Company Code</span>
                <span className="font-mono text-xs bg-white/10 px-2 py-0.5 rounded text-[#75ADAF]">
                  {org?.company_code ?? '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5 text-sm">
                <span className="text-white/60">Team Size</span>
                <span>{org?.team_size ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5 text-sm">
                <span className="text-white/60">Country</span>
                <span>{org?.country ?? '—'}</span>
              </div>
              <div className="flex justify-between items-center py-1 text-sm">
                <span className="text-white/60">Joined</span>
                <span>{formatDate(account?.joined_at)}</span>
              </div>
            </div>
          </div>

          {/* Edit Company Settings (Owner / Admin) */}
          {canEditCompanySettings && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
                Company Settings
              </h3>
              <form onSubmit={handleSaveCompanySettings} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={companyNameInput}
                    onChange={(e) => setCompanyNameInput(e.target.value)}
                    placeholder="Enter company name"
                    className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#75ADAF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">
                    Country
                  </label>
                  <input
                    type="text"
                    value={countryInput}
                    onChange={(e) => setCountryInput(e.target.value)}
                    placeholder="e.g. Kenya, Nigeria"
                    className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#75ADAF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/70 mb-1.5">
                    Team Size
                  </label>
                  <input
                    type="text"
                    value={teamSizeInput}
                    onChange={(e) => setTeamSizeInput(e.target.value)}
                    placeholder="e.g. 10-50"
                    className="w-full h-11 px-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#75ADAF]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={updateCompanySettingsMutation.isPending}
                  className="w-full h-11 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-white font-semibold text-sm transition-colors flex items-center justify-center disabled:opacity-50"
                >
                  {updateCompanySettingsMutation.isPending ? 'Saving...' : 'Save Company Details'}
                </button>
              </form>
            </div>
          )}

          {/* Account Details */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-5 space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
              Account Security
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-white/60">Email Verified</span>
                <span className={isEmailVerified ? 'text-emerald-400' : 'text-amber-400'}>
                  {isEmailVerified ? 'Verified' : 'Unverified'}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-white/60">Phone</span>
                <span>{identity?.phone || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ScreenErrorBoundary>
  );
}
