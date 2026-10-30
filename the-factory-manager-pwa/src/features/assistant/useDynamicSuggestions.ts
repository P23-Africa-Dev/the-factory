'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTaskListItems } from '@/features/tasks';
import { useAgentUploadsOverview } from '@/features/crm';

export interface AssistantSuggestion {
  id: string;
  label: string;
  prompt: string;
  withGeolocation?: boolean;
}

const ROTATION_INTERVAL_MS = 20_000;
const VISIBLE_COUNT = 4;

export function useDynamicSuggestions(): AssistantSuggestion[] {
  const { data: tasks = [] } = useTaskListItems();
  const { data: leadsOverview } = useAgentUploadsOverview();

  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status === 'pending').length,
    [tasks],
  );
  const totalLeads = leadsOverview?.total_uploaded_leads ?? 0;

  const pool = useMemo<AssistantSuggestion[]>(() => {
    const items: AssistantSuggestion[] = [
      {
        id: 'exec-brief',
        label: '📊 Executive operations brief',
        prompt: 'Give me an executive summary of team tasks, field attendance, and urgent bottlenecks today.',
      },
      {
        id: 'delayed-agents',
        label: '🛰️ Check delayed or offline field agents',
        prompt: 'Which field agents are currently delayed, offline, or behind on their assigned tasks today?',
      },
    ];

    if (pendingTasks > 0) {
      items.push({
        id: 'pending-tasks',
        label: `📋 Audit ${pendingTasks} pending team task${pendingTasks > 1 ? 's' : ''}`,
        prompt: 'List our pending and overdue team tasks and recommend reassignments or priorities.',
      });
    }
    if (totalLeads > 0) {
      items.push({
        id: 'pipeline-velocity',
        label: '📈 CRM pipeline & lead conversion',
        prompt: 'Analyze our company CRM pipeline and highlight top-performing agents and high-value leads.',
      });
    }

    items.push(
      {
        id: 'create-task-action',
        label: '➕ Assign a new field task',
        prompt: 'Help me create and assign a high-priority field visit task for an agent.',
      },
      {
        id: 'kpi-performance',
        label: '🎯 Team KPI performance check',
        prompt: 'Summarize our active company KPIs and identify which targets are at risk.',
      },
      {
        id: 'attendance-audit',
        label: '🕒 Workforce attendance & late arrivals',
        prompt: 'Show today’s workforce attendance summary, including late clock-ins and absences.',
      },
    );

    return items;
  }, [pendingTasks, totalLeads]);

  const [rotation, setRotation] = useState(() => Math.floor(Date.now() / ROTATION_INTERVAL_MS));
  useEffect(() => {
    const timer = setInterval(() => setRotation((r) => r + 1), ROTATION_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return useMemo(() => {
    if (pool.length <= VISIBLE_COUNT) return pool;
    const start = rotation % pool.length;
    return Array.from({ length: VISIBLE_COUNT }, (_, i) => pool[(start + i) % pool.length]);
  }, [pool, rotation]);
}
