import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';

export interface InternalUserRecord {
  id: number;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status?: 'active' | 'suspended' | 'invited' | string;
  is_suspended?: boolean;
  supervisor_id?: number | null;
  supervisor_name?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
}

export interface InviteInternalUserPayload {
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'agent';
  phone?: string | null;
  supervisor_id?: number | null;
}

export interface PayrollOverviewSummary {
  period?: string;
  total_agents?: number;
  approved_count?: number;
  pending_count?: number;
  rejected_count?: number;
  total_estimated_payout?: number;
  currency?: string;
}

export interface AgentPayrollRecord {
  user_id: number;
  name: string;
  email?: string;
  role?: string;
  avatar_url?: string | null;
  days_present?: number;
  days_late?: number;
  days_absent?: number;
  total_hours?: number;
  tasks_completed?: number;
  base_pay?: number;
  bonus_pay?: number;
  deductions?: number;
  net_pay?: number;
  currency?: string;
  approval_status?: 'pending' | 'approved' | 'rejected' | string;
}

export const workforceApi = {
  getInternalUsers: async (params?: { role?: string; search?: string }): Promise<InternalUserRecord[]> => {
    const companyId = getActiveCompanyId();
    const { data } = await client.get<{ data?: unknown }>('/admin/internal-users', {
      params: { company_id: companyId, ...params },
      suppressErrorToast: true,
    });
    const raw = data?.data ?? data;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { data?: unknown })?.data)
        ? ((raw as { data: unknown[] }).data)
        : Array.isArray((raw as { users?: unknown })?.users)
          ? ((raw as { users: unknown[] }).users)
          : [];
    return list.map((u: Record<string, unknown>) => ({
      id: Number(u.id ?? u.user_id ?? 0),
      name: String(u.name ?? u.full_name ?? 'Team Member'),
      email: String(u.email ?? ''),
      phone: (u.phone as string | null) ?? null,
      role: String(u.role ?? 'agent'),
      status: String(u.status ?? (u.is_suspended ? 'suspended' : 'active')),
      is_suspended: Boolean(u.is_suspended ?? u.status === 'suspended'),
      supervisor_id: u.supervisor_id != null ? Number(u.supervisor_id) : null,
      supervisor_name:
        (u.supervisor_name as string | null) ??
        ((u.supervisor as { name?: string } | null)?.name ?? null),
      avatar_url: (u.avatar_url as string | null) ?? null,
      created_at: (u.created_at as string | null) ?? null,
    }));
  },

  inviteUser: async (payload: InviteInternalUserPayload): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.post('/admin/internal-users/invitations', {
      company_id: companyId,
      ...payload,
    });
  },

  suspendUser: async (userId: number): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.patch(`/admin/internal-users/${userId}/suspend`, {
      company_id: companyId,
    });
  },

  reactivateUser: async (userId: number): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.patch(`/admin/internal-users/${userId}/reactivate`, {
      company_id: companyId,
    });
  },

  assignSupervisor: async (userId: number, supervisorId: number | null): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.patch(`/admin/internal-users/${userId}/supervisor`, {
      company_id: companyId,
      supervisor_id: supervisorId,
    });
  },

  getPayrollOverview: async (params?: { month?: string }): Promise<PayrollOverviewSummary> => {
    const companyId = getActiveCompanyId();
    const { data } = await client.get<{ data?: PayrollOverviewSummary }>('/admin/payroll/overview', {
      params: { company_id: companyId, ...params },
      suppressErrorToast: true,
    });
    return (data?.data ?? data ?? {}) as PayrollOverviewSummary;
  },

  getPayrollAgents: async (params?: { month?: string }): Promise<AgentPayrollRecord[]> => {
    const companyId = getActiveCompanyId();
    const { data } = await client.get<{ data?: unknown }>('/admin/payroll/agents', {
      params: { company_id: companyId, ...params },
      suppressErrorToast: true,
    });
    const raw = data?.data ?? data;
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as { agents?: unknown })?.agents)
        ? ((raw as { agents: unknown[] }).agents)
        : Array.isArray((raw as { data?: unknown })?.data)
          ? ((raw as { data: unknown[] }).data)
          : [];
    return list.map((item: Record<string, unknown>) => ({
      user_id: Number(item.user_id ?? item.id ?? 0),
      name: String(item.name ?? item.user_name ?? 'Agent'),
      email: (item.email as string | undefined) ?? '',
      role: String(item.role ?? 'agent'),
      avatar_url: (item.avatar_url as string | null) ?? null,
      days_present: Number(item.days_present ?? item.present_days ?? 0),
      days_late: Number(item.days_late ?? item.late_days ?? 0),
      days_absent: Number(item.days_absent ?? item.absent_days ?? 0),
      total_hours: Number(item.total_hours ?? item.hours_worked ?? 0),
      tasks_completed: Number(item.tasks_completed ?? item.completed_tasks ?? 0),
      base_pay: Number(item.base_pay ?? 0),
      bonus_pay: Number(item.bonus_pay ?? 0),
      deductions: Number(item.deductions ?? 0),
      net_pay: Number(item.net_pay ?? item.total_pay ?? 0),
      currency: String(item.currency ?? 'NGN'),
      approval_status: String(item.approval_status ?? item.status ?? 'pending'),
    }));
  },

  updatePayrollApproval: async (params: {
    userId: number;
    status: 'approved' | 'rejected';
    month?: string;
    notes?: string;
  }): Promise<void> => {
    const companyId = getActiveCompanyId();
    await client.patch(`/admin/payroll/agents/${params.userId}/approval`, {
      company_id: companyId,
      status: params.status,
      month: params.month,
      notes: params.notes,
    });
  },
};

export const useInternalUsers = (params?: { role?: string; search?: string }) => {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: ['admin-internal-users', companyId, params],
    queryFn: () => workforceApi.getInternalUsers(params),
    enabled: Boolean(companyId),
  });
};

export const useInviteInternalUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: InviteInternalUserPayload) => workforceApi.inviteUser(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-internal-users'] });
    },
  });
};

export const useSuspendUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => workforceApi.suspendUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-internal-users'] });
    },
  });
};

export const useReactivateUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => workforceApi.reactivateUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-internal-users'] });
    },
  });
};

export const useAssignSupervisor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, supervisorId }: { userId: number; supervisorId: number | null }) =>
      workforceApi.assignSupervisor(userId, supervisorId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-internal-users'] });
    },
  });
};

export const usePayrollOverview = (params?: { month?: string }) => {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: ['admin-payroll-overview', companyId, params?.month],
    queryFn: () => workforceApi.getPayrollOverview(params),
    enabled: Boolean(companyId),
  });
};

export const usePayrollAgents = (params?: { month?: string }) => {
  const companyId = getActiveCompanyId();
  return useQuery({
    queryKey: ['admin-payroll-agents', companyId, params?.month],
    queryFn: () => workforceApi.getPayrollAgents(params),
    enabled: Boolean(companyId),
  });
};

export const useUpdatePayrollApproval = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: workforceApi.updatePayrollApproval,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-payroll-overview'] });
      qc.invalidateQueries({ queryKey: ['admin-payroll-agents'] });
    },
  });
};

