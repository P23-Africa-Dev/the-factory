'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Wallet, Route, Building2 } from 'lucide-react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import {
  useProfile,
  useAuth,
  useAuthNavigation,
  useAgentIdentity,
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

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-none">
      <span className="text-xs font-semibold text-white/50">{label}</span>
      <span className="text-xs font-semibold text-white text-right max-w-[70%] truncate">
        {value || '—'}
      </span>
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3.5">{children}</div>;
}

function InfoCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">{label}</span>
      <div className="bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-2.5 min-h-[40px] truncate text-xs font-semibold text-white">
        {value || '—'}
      </div>
    </div>
  );
}

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0B3343]/75 border border-white/10 rounded-2xl p-5 flex flex-col">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5 select-none">
        <span className="text-sm">{icon}</span>
        <span className="text-[10px] font-bold tracking-widest text-[#75ADAF] uppercase">{title}</span>
      </div>
      {children}
    </div>
  );
}

function StatusChip({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-semibold select-none ${
        active
          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          : 'bg-white/5 border-white/10 text-white/40'
      }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-white/40'}`} />
      <span>{label}</span>
    </div>
  );
}

function RoleBadge({ label, variant }: { label: string; variant: 'primary' | 'secondary' | 'company' }) {
  const styles = {
    primary: 'bg-[#75ADAF]/15 border-[#75ADAF] text-[#75ADAF]',
    secondary: 'bg-white/[0.06] border-white/20 text-white/50',
    company: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
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
  const { avatarSrc, roleLabel } = useAgentIdentity();
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
      toast.success('Organization settings saved.');
    } catch (err) {
      showApiErrorToast(err, 'Could not update company settings');
    }
  };

  return (
    <ScreenErrorBoundary screenName="Profile">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-10">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)] mb-6">
          <button
            onClick={goBack}
            className="w-10 h-10 flex items-center justify-center text-3xl font-light text-white/90 hover:text-white transition-colors focus:outline-none"
            aria-label="Go back"
          >
            ‹
          </button>
          <h2 className="font-bold text-lg text-white">Manager Profile</h2>
          <div className="w-10" />
        </div>

        {/* Scrollable Content */}
        <div className="relative z-10 flex-1 px-5 overflow-y-auto pb-20 flex flex-col gap-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#75ADAF] border-t-transparent" />
              <p className="text-xs text-white/40 font-semibold">Loading profile…</p>
            </div>
          ) : isError && !hasProfileData ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4 bg-white/[0.03] border border-white/5 rounded-2xl">
              <h4 className="text-sm font-semibold text-white">Couldn&apos;t load profile</h4>
              <button
                onClick={() => refetch()}
                className="px-6 py-2 bg-white/[0.08] text-[#75ADAF] text-xs font-semibold rounded-full hover:bg-white/[0.12] transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              {/* Hero Card */}
              <div className="bg-[#0B3343]/75 border border-white/10 rounded-2xl flex flex-col items-center py-6 px-4 text-center">
                <div className="w-24 h-24 rounded-full border-3 border-[#75ADAF] overflow-hidden mb-4 bg-[#0A2D3A]">
                  <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                </div>
                <h3 className="font-bold text-lg text-white mb-1">{displayName}</h3>
                {displayEmail && <p className="text-xs text-white/50 mb-4">{displayEmail}</p>}

                {/* Role Badges Row */}
                <div className="flex flex-wrap gap-2 justify-center">
                  {accessRole && (
                    <RoleBadge
                      label={accessRole.charAt(0).toUpperCase() + accessRole.slice(1)}
                      variant="primary"
                    />
                  )}
                  {internalRole && internalRole !== accessRole && (
                    <RoleBadge
                      label={internalRole.charAt(0).toUpperCase() + internalRole.slice(1)}
                      variant="secondary"
                    />
                  )}
                  {companyName && <RoleBadge label={companyName} variant="company" />}
                </div>
              </div>

              {/* Quick Management Consoles */}
              <SectionCard title="Management Consoles" icon="⚡">
                <div className="grid grid-cols-3 gap-2.5">
                  <Link
                    href="/workforce"
                    className="p-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 flex flex-col items-center gap-1.5 text-center"
                  >
                    <Users className="w-5 h-5 text-[#75ADAF]" />
                    <span className="text-[11px] font-bold text-white">Workforce</span>
                  </Link>
                  <Link
                    href="/payroll"
                    className="p-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 flex flex-col items-center gap-1.5 text-center"
                  >
                    <Wallet className="w-5 h-5 text-[#FD6046]" />
                    <span className="text-[11px] font-bold text-white">Payroll</span>
                  </Link>
                  <Link
                    href="/field-activity"
                    className="p-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/10 flex flex-col items-center gap-1.5 text-center"
                  >
                    <Route className="w-5 h-5 text-emerald-400" />
                    <span className="text-[11px] font-bold text-white">Journeys</span>
                  </Link>
                </div>
              </SectionCard>

              {/* Identity Details Card */}
              <SectionCard title="Identity" icon="👤">
                <InfoGrid>
                  <InfoCell label="Full Name" value={identity?.name} />
                  <InfoCell label="Email" value={identity?.email} />
                  <InfoCell label="Phone Number" value={identity?.phone} />
                  <InfoCell
                    label="Gender"
                    value={
                      identity?.gender
                        ? identity.gender.charAt(0).toUpperCase() + identity.gender.slice(1)
                        : undefined
                    }
                  />
                </InfoGrid>
              </SectionCard>

              {/* Organization Details Card */}
              {org && (
                <SectionCard title="Organization" icon="🏢">
                  <InfoGrid>
                    <InfoCell label="Company Name" value={org.company_name} />
                    <InfoCell label="Company ID" value={org.company_code} />
                    <InfoCell label="Role" value={org.role} />
                    <InfoCell label="Membership" value={org.membership} />
                    <InfoCell label="Team Size" value={org.team_size} />
                    <InfoCell label="Country" value={org.country} />
                    <InfoCell label="Purpose" value={org.purpose} />
                    <InfoCell label="Joined" value={formatDate(org.joined_at)} />
                  </InfoGrid>
                </SectionCard>
              )}

              {/* Owner/Admin Company Settings Editor */}
              {canEditCompanySettings && (
                <SectionCard title="Company Settings (Owner / Admin)" icon="⚙️">
                  <form onSubmit={handleSaveCompanySettings} className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={companyNameInput}
                        onChange={(e) => setCompanyNameInput(e.target.value)}
                        placeholder={org?.company_name || 'Organization Name'}
                        className="w-full h-10 rounded-xl bg-white/[0.06] border border-white/15 px-3 text-xs text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                          Country
                        </label>
                        <input
                          type="text"
                          value={countryInput}
                          onChange={(e) => setCountryInput(e.target.value)}
                          placeholder={org?.country || 'Nigeria'}
                          className="w-full h-10 rounded-xl bg-white/[0.06] border border-white/15 px-3 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-white/50 mb-1">
                          Team Size
                        </label>
                        <input
                          type="text"
                          value={teamSizeInput}
                          onChange={(e) => setTeamSizeInput(e.target.value)}
                          placeholder={org?.team_size || '10-50'}
                          className="w-full h-10 rounded-xl bg-white/[0.06] border border-white/15 px-3 text-xs text-white"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={updateCompanySettingsMutation.isPending}
                      className="w-full h-10 rounded-xl bg-[#75ADAF] text-[#0A1D25] font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      {updateCompanySettingsMutation.isPending ? 'Saving…' : 'Update Company Settings'}
                    </button>
                  </form>
                </SectionCard>
              )}

              {/* Account Card */}
              {account && (
                <SectionCard title="Account" icon="🔐">
                  <div className="flex gap-2.5 mb-4">
                    <StatusChip label={isActive ? 'Active' : 'Inactive'} active={isActive} />
                    <StatusChip label={isEmailVerified ? 'Verified' : 'Unverified'} active={isEmailVerified} />
                  </div>

                  {account.onboarding_type && (
                    <InfoRow
                      label="Onboarding"
                      value={account.onboarding_type.charAt(0).toUpperCase() + account.onboarding_type.slice(1)}
                    />
                  )}
                </SectionCard>
              )}
            </>
          )}
        </div>
      </div>
    </ScreenErrorBoundary>
  );
}
