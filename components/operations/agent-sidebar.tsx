'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentItem } from './agent-list';
import { getAgentSessionBadgeClass } from '@/lib/agent-presence';
import { useUpdateInternalUser } from '@/hooks/use-internal-users';
import { useCompanyZones } from '@/hooks/use-internal-users';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { UserLifecycleActions, DeleteUserIconButton } from '@/components/operations/user-lifecycle-actions';
import { useUserManagementPermissions } from '@/hooks/use-user-management-permissions';

interface AgentSidebarProps {
  agent: AgentItem | null;
}

function mailTo(email: string) {
  return `mailto:${email}`;
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'agent', label: 'Agent' },
];

export function AgentInfoCard({ agent }: { agent: AgentItem }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(agent.name);
  const [zone, setZone] = useState(agent.zone === 'Unassigned' ? '' : agent.zone);
  const [zoneIds, setZoneIds] = useState<number[]>(agent.zoneIds ?? []);
  const [phone, setPhone] = useState(agent.phone);
  const [role, setRole] = useState(agent.role);

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const updateMutation = useUpdateInternalUser();
  const { data: zones = [] } = useCompanyZones(companyId ?? undefined);
  const permissions = useUserManagementPermissions({
    internalRole: agent.internalRole ?? agent.role,
    supervisorUserId: agent.supervisorUserId,
    isSuspended: agent.isSuspended,
  });

  const roleOptions = permissions.role === 'owner' || permissions.role === 'admin'
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((option) => option.value === 'agent');

  // Reset local state when a new agent is selected
  const agentId = agent.id;

  const handleEdit = () => {
    setName(agent.name);
    setZone(agent.zone === 'Unassigned' ? '' : agent.zone);
    setZoneIds(agent.zoneIds ?? []);
    setPhone(agent.phone);
    setRole(agent.role);
    setEditing(true);
  };

  const handleCancel = () => setEditing(false);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Name is required.');
      return;
    }
    if (!companyId) {
      toast.error('No active company found. Please refresh and try again.');
      return;
    }

    updateMutation.mutate(
      {
        userId: agentId,
        payload: {
          company_id: companyId,
          full_name: name.trim(),
          role: role as 'admin' | 'supervisor' | 'agent',
          assigned_zone: zone.trim() || null,
          assigned_zone_ids: zoneIds,
          phone_number: phone.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Agent updated.');
          setEditing(false);
        },
        onError: () => {
          toast.error('Failed to update agent. Please try again.');
        },
      }
    );
  };

  return (
    <div className="px-4 sm:px-8 overflow-hidden">
      <div className="flex items-start gap-5 min-w-0">

        {/* Left: details / edit form */}
        <div className="flex-1 space-y-3 min-w-0 overflow-hidden">
          {editing ? (
            <>
              {/* Name */}
              <div>
                <p className="text-[11px] font-bold text-dash-dark mb-1">Name</p>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-dash-dark outline-none focus:border-dash-dark transition-colors"
                  placeholder="Full name"
                />
              </div>

              {/* Email — read only */}
              <div>
                <p className="text-[11px] font-bold text-dash-dark mb-1">Email</p>
                <p className="text-[12px] text-gray-400 px-3 py-1.5 bg-gray-50 rounded-lg border border-dashed border-gray-200 select-all truncate">
                  {agent.email}
                </p>
              </div>

              {/* Zone */}
              <div>
                <p className="text-[11px] font-bold text-dash-dark mb-1">Zone</p>
                <div className="flex flex-wrap gap-1.5">
                  {zones.map((zoneOption) => {
                    const selected = zoneIds.includes(zoneOption.id);
                    return (
                      <button
                        key={zoneOption.id}
                        type="button"
                        onClick={() => {
                          setZoneIds((prev) => selected
                            ? prev.filter((id) => id !== zoneOption.id)
                            : [...prev, zoneOption.id]);
                          if (!selected) {
                            setZone((prev) => prev || zoneOption.name);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-full border text-[11px] ${selected
                          ? 'bg-dash-dark text-white border-dash-dark'
                          : 'bg-white text-gray-500 border-gray-200'
                          }`}
                      >
                        {zoneOption.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Phone */}
              <div>
                <p className="text-[11px] font-bold text-dash-dark mb-1">Phone Number</p>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-dash-dark outline-none focus:border-dash-dark transition-colors"
                  placeholder="+234 800 000 0000"
                />
              </div>

              {/* Role */}
              {(permissions.role === 'owner' || permissions.role === 'admin') && (
                <div>
                  <p className="text-[11px] font-bold text-dash-dark mb-1">Role</p>
                  <SearchableSelect
                    value={role}
                    onChange={setRole}
                    options={roleOptions}
                    placeholder="Select role"
                    className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-dash-dark"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex-1 py-2 bg-dash-dark text-white rounded-lg text-[12px] font-semibold hover:opacity-90 transition-all disabled:opacity-60 cursor-pointer"
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={updateMutation.isPending}
                  className="flex-1 py-2 border border-gray-200 text-gray-500 rounded-lg text-[12px] font-semibold hover:bg-gray-50 transition-all disabled:opacity-60 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <h3 className="text-[13px] font-extrabold text-dash-dark leading-tight">{agent.name}</h3>
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed max-w-45">
                  {agent.email}
                </p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Zone</p>
                <p className="text-[12px] text-gray-400">{agent.zone}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Phone Number</p>
                <p className="text-[12px] text-gray-400">{agent.phone || '—'}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Role</p>
                <p className="text-[12px] text-gray-400">{agent.role}</p>
              </div>
              {agent.isSuspended && (
                <div>
                  <p className="text-[13px] font-bold text-dash-dark mb-0.5">Status</p>
                  <p className="text-[12px] text-amber-700">
                    Suspended{agent.suspendedUntil ? ` until ${new Date(agent.suspendedUntil).toLocaleDateString()}` : ''}
                  </p>
                </div>
              )}
              <UserLifecycleActions
                userId={agentId}
                userName={agent.name}
                companyId={companyId ?? undefined}
                internalRole={agent.internalRole ?? agent.role}
                supervisorUserId={agent.supervisorUserId}
                isSuspended={agent.isSuspended}
                suspendedUntil={agent.suspendedUntil}
              />
            </>
          )}
        </div>

        {/* Right: avatar card + action icons */}
        <div className="shrink-0 flex flex-col items-center">
          <div className="bg-white p-2 rounded-[30px]">
            {/* Avatar */}
            <div className="w-32 h-32 rounded-[22px] overflow-hidden shadow-md">
              <img
                src={agent.avatar}
                className="w-full h-full object-cover"
                alt={agent.name}
              />
            </div>

            {/* Name + zone + status badge */}
            <div className="mt-2.5 flex flex-col items-center gap-1">
              <p className="text-[13px] font-bold text-dash-dark">{agent.name}</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">{agent.zone}</span>
                <span
                  className={`px-2.5 py-0.75 rounded-full text-[9px] font-bold ${getAgentSessionBadgeClass(agent.isSessionOnline)}`}
                >
                  {agent.isSessionOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
          </div>

          {/* Action icons */}
          <div className="flex items-center gap-3 mt-4">
            {/* Message / email */}
            <svg
              onClick={() => { window.location.href = mailTo(agent.email || ''); }}
              className="cursor-pointer"
              width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="16.2378" cy="16.2378" r="15.9878" fill="#EAEAEA" stroke="#DFDFDF" strokeWidth="0.5" />
              <path d="M13.9717 18.5035H19.2584M13.9717 14.7273H16.615" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M18.2543 23.33C21.4135 23.12 23.9299 20.5678 24.137 17.3639C24.1775 16.7369 24.1775 16.0875 24.137 15.4605C23.9299 12.2565 21.4135 9.70435 18.2543 9.49435C17.1765 9.42271 16.0512 9.42286 14.9756 9.49435C11.8164 9.70435 9.29995 12.2565 9.09289 15.4605C9.05237 16.0875 9.05237 16.7369 9.09289 17.3639C9.16831 18.5308 9.68439 19.6113 10.292 20.5236C10.6447 21.1623 10.4119 21.9595 10.0445 22.6558C9.77953 23.1579 9.64706 23.4089 9.75343 23.5903C9.85979 23.7716 10.0974 23.7774 10.5726 23.789C11.5123 23.8118 12.1459 23.5454 12.6489 23.1745C12.9342 22.9642 13.0768 22.859 13.1751 22.8469C13.2734 22.8348 13.4669 22.9145 13.8538 23.0738C14.2015 23.217 14.6052 23.3054 14.9756 23.33C16.0512 23.4015 17.1765 23.4017 18.2543 23.33Z" stroke="#2F5E71" strokeLinejoin="round" />
            </svg>

            {/* Edit — toggles inline form */}
            {permissions.canEdit && (
            <svg
              onClick={() => (editing ? handleCancel() : handleEdit())}
              className="cursor-pointer"
              width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="16.2378" cy="16.2378" r="15.9878"
                fill={editing ? '#09232D' : '#EAEAEA'}
                stroke="#DFDFDF"
                strokeWidth="0.5"
              />
              <path
                d="M19.5 10.5L22.5 13.5M10.5 22.5H13.5L21.5 14.5L18.5 11.5L10.5 19.5V22.5Z"
                stroke={editing ? '#ffffff' : '#2F5E71'}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            )}
            <DeleteUserIconButton
              userId={agentId}
              userName={agent.name}
              companyId={companyId ?? undefined}
              internalRole={agent.internalRole ?? agent.role}
              supervisorUserId={agent.supervisorUserId}
              isSuspended={agent.isSuspended}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AgentLiveDetails({ agent }: { agent: AgentItem }) {
  const hasLocation = Boolean(
    agent.isMapActive &&
      (agent.location || agent.latitude || agent.longitude),
  );
  const locationLabel = agent.presence?.activeTaskTitle
    ? `Active at ${agent.presence.activeTaskTitle}`
    : agent.isMapActive
      ? 'Sharing live location'
      : 'Active at Kemsi Street';

  return (
    <div className="bg-[#0A1A22] rounded-[28px] p-6 shadow-2xl">
      <h3 className="text-[16px] font-extrabold text-white mb-5">Live Details</h3>

      {/* Map preview */}
      <div className="relative h-48 w-full rounded-[20px] bg-[#EDF0F3] overflow-hidden shadow-inner">

        {/* Background map grid */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.3 }}>
          <defs>
            <pattern id="mapgrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#B0BEC5" strokeWidth="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mapgrid)" />
        </svg>

        {/* Main vertical road */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: '32%',
            top: 0,
            bottom: 0,
            width: 38,
            background: 'linear-gradient(to right, #F5F5F5 2px, #FFFFFF 2px, #FFFFFF 36px, #F5F5F5 36px)',
          }}
        />
        {/* Main horizontal road */}
        <div
          className="absolute pointer-events-none"
          style={{
            top: '50%',
            left: 0,
            right: 0,
            height: 28,
            transform: 'translateY(-50%)',
            background: 'linear-gradient(to bottom, #F5F5F5 2px, #FFFFFF 2px, #FFFFFF 26px, #F5F5F5 26px)',
          }}
        />

        {/* Park/green area */}
        <div
          className="absolute pointer-events-none rounded-md"
          style={{ right: 4, top: '26%', width: 44, height: 60, background: 'rgba(168, 213, 181, 0.5)' }}
        />

        {/* Street label — "Dresd Street" rotated vertically */}
        <div
          className="absolute pointer-events-none"
          style={{ left: '36%', top: 10, transform: 'rotate(-90deg)', transformOrigin: 'left top' }}
        >
          <span className="text-[10px] font-bold text-gray-500 whitespace-nowrap tracking-wide">
            Dresd Street
          </span>
        </div>

        {/* Street label — "McDo ell Str" on the right */}
        <div className="absolute pointer-events-none" style={{ right: 6, top: '16%' }}>
          <span className="text-[9px] font-bold text-gray-500 block leading-tight">McDo</span>
          <span className="text-[9px] font-bold text-gray-500 block leading-tight">ell Str</span>
        </div>

        {/* Red location pin */}
        <div className="absolute" style={{ left: '28%', top: '22%' }}>
          <div className="relative">
            <MapPin size={22} className="text-red-500 fill-red-500 drop-shadow-lg" />
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-1 bg-black/15 rounded-full blur-sm" />
          </div>
        </div>

        {/* Agent avatar with purple ring + label */}
        <div className="absolute flex flex-col items-center" style={{ left: 'calc(26%)', top: '48%' }}>
          <div className="w-10 h-10 rounded-full border-[3px] border-[#9D4EDD] shadow-lg overflow-hidden bg-white">
            <img src={agent.avatar} className="w-full h-full object-cover" alt="Agent" />
          </div>
          <div className="bg-white px-2.5 py-1 rounded-lg mt-1.5 whitespace-nowrap shadow-lg border border-gray-100/50">
            <p className="text-[9px] font-bold text-dash-dark">{agent.name}</p>
            <p className="text-[7px] text-gray-400">{locationLabel}</p>
          </div>
        </div>

        {/* Purple radius indicator */}
        <div className="absolute" style={{ left: '58%', top: '24%' }}>
          <div className="w-10 h-10 rounded-full bg-[#C77DFF]/15 flex items-center justify-center border-[3px] border-[#C77DFF]/40">
            <div className="w-3.5 h-3.5 bg-[#9D4EDD] rounded-full shadow-sm" />
          </div>
        </div>
      </div>

      {/* Progress bars - commented out per user request */}
      {/*
      <div className="mt-6 px-1">
        <div className="flex gap-1 h-3.5">
          <div className="w-[55%] bg-[#4FD1C5] rounded-full" />
          <div className="w-[45%] bg-[#EF5350] rounded-full" />
        </div>
        <div className="flex mt-2.5 gap-8">
          <p className="text-[12px] text-gray-400 font-medium">Completed</p>
          <p className="text-[12px] text-gray-400 font-medium">Pending</p>
        </div>
      </div>
      */}

      {/* CTA button + status */}
      <div className="mt-6">
        {hasLocation && (
          <button
            className={`px-6 py-2.5 rounded-full text-[12px] font-bold transition-all inline-flex items-center gap-2 cursor-pointer ${
              agent.isMapActive
                ? 'bg-[#9333EA] text-white hover:bg-[#7E22CE]'
                : 'bg-gray-600 text-white hover:bg-gray-500'
            }`}
          >
            {agent.isMapActive ? 'Active (View on Map)' : 'Offline'}
            {agent.isMapActive && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
          </button>
        )}
        <p className="text-[11px] text-gray-500 mt-2.5 ml-1">{agent.time}</p>
      </div>
    </div>
  );
}

export function AgentSidebar({ agent }: AgentSidebarProps) {
  if (!agent) return null;

  return (
    <div className="flex flex-col gap-5 w-full xl:w-90 xl:shrink-0">
      <AgentInfoCard agent={agent} />
      <AgentLiveDetails agent={agent} />
    </div>
  );
}
