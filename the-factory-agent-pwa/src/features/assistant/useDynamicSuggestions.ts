'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTaskListItems } from '@/features/tasks';
import { useAgentUploadsOverview } from '@/features/crm';

export interface AssistantSuggestion {
  id: string;
  /** Button label (with emoji) shown in the empty state. */
  label: string;
  /** The prompt actually sent to ELY when tapped. */
  prompt: string;
  /** When true, attach last-known GPS coordinates for planning prompts. */
  withGeolocation?: boolean;
}

const ROTATION_INTERVAL_MS = 20_000;
const VISIBLE_COUNT = 4;

/**
 * Builds context-aware quick actions from the agent's live data (active tasks,
 * CRM leads) blended with general AI recommendations, then rotates the visible
 * subset on an interval so the agent doesn't see the same four prompts every
 * time. Prompts map to the backend's agent-permitted read tools and to
 * conversational drafting (e.g. follow-up emails).
 */
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
        id: 'plan-my-day',
        label: '📋 Plan my day',
        prompt: 'Plan my day',
        withGeolocation: true,
      },
    ];

    // ── User activity / agent context (data-driven) ──────────────────────────
    if (pendingTasks > 0) {
      items.push({
        id: 'pending-tasks',
        label: `Review my ${pendingTasks} pending task${pendingTasks > 1 ? 's' : ''}`,
        prompt: 'What are my pending and overdue tasks? Which should I prioritise?',
      });
    }
    if (totalLeads > 0) {
      items.push({
        id: 'draft-followup',
        label: 'Draft a follow-up email',
        prompt:
          'Draft a personalised follow-up outreach email for my leads that have gone quiet.',
      });
      items.push({
        id: 'top-leads',
        label: 'Show my top leads',
        prompt: 'Show my top leads in the CRM pipeline and suggest next actions.',
      });
    }

    // ── AI recommendations (always available) ────────────────────────────────
    items.push(
      {
        id: 'today-summary',
        label: "Summarise today's activities",
        prompt: 'Give me a summary of my activities and performance today.',
      },
      {
        id: 'meetings-today',
        label: "Prepare for today's meetings",
        prompt: 'Summarise my meetings today and suggest talking points for each.',
      },
      {
        id: 'upcoming-meetings',
        label: 'My upcoming meetings',
        prompt: 'List my upcoming meetings this week.',
      },
      {
        id: 'attention',
        label: 'What needs my attention?',
        prompt: 'What should I focus on right now? Are there any follow-ups due?',
      },
      {
        id: 'attendance',
        label: 'My attendance summary',
        prompt: 'Show my attendance summary for today.',
      },
    );

    return items;
  }, [pendingTasks, totalLeads]);

  // Rotate the visible window. Seed with a time-based offset so reopening the
  // assistant doesn't always start at the same suggestions.
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
