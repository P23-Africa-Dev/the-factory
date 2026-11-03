import { useMemo } from 'react';
import { useManagerIdentity } from './useManagerIdentity';
import { useCompanySettings } from '../queries';

export type ManagerPermissions = {
  role: 'owner' | 'admin' | 'supervisor';
  roleLabel: 'Owner' | 'Admin' | 'Supervisor';
  isOwner: boolean;
  isAdmin: boolean;
  isSupervisor: boolean;
  canManageAllCompanyData: boolean;
  canCreateAdminsAndSupervisors: boolean;
  canCreateAgents: boolean;
  canManageUsers: boolean;
  canSuspendAgents: boolean;
  canDeleteAgents: boolean;
  canAccessPayroll: boolean;
  canApprovePayroll: boolean;
  canEditCompanySettings: boolean;
  canManageAttendanceSettings: boolean;
  canApproveCrmCustomFields: boolean;
};

export function useManagerPermissions(): ManagerPermissions {
  const identity = useManagerIdentity();
  const { data: companySettings } = useCompanySettings(Boolean(identity.id));

  return useMemo(() => {
    const { isOwner, isAdmin, isSupervisor, role, roleLabel } = identity;
    const umSettings = companySettings?.settings?.user_management;
    const payrollSettings = companySettings?.settings?.payroll;

    const supervisorCanSuspendAgents = Boolean(umSettings?.supervisor_can_suspend_agents);
    const supervisorCanDeleteAgents = Boolean(umSettings?.supervisor_can_delete_agents);
    const adminCanAccessPayroll = payrollSettings?.admin_can_access_payroll !== false;

    const canAccessPayroll = isOwner || (isAdmin && adminCanAccessPayroll);

    return {
      role,
      roleLabel,
      isOwner,
      isAdmin,
      isSupervisor,
      canManageAllCompanyData: isOwner || isAdmin,
      canCreateAdminsAndSupervisors: isOwner || isAdmin,
      canCreateAgents: isOwner || isAdmin,
      canManageUsers: isOwner || isAdmin,
      canSuspendAgents: isOwner || isAdmin || (isSupervisor && supervisorCanSuspendAgents),
      canDeleteAgents: isOwner || isAdmin || (isSupervisor && supervisorCanDeleteAgents),
      canAccessPayroll,
      canApprovePayroll: canAccessPayroll,
      canEditCompanySettings: isOwner || isAdmin,
      canManageAttendanceSettings: isOwner || isAdmin,
      canApproveCrmCustomFields: isOwner || isAdmin,
    };
  }, [identity, companySettings]);
}
