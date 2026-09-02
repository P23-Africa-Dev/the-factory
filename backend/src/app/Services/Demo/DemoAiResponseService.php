<?php

declare(strict_types=1);

namespace App\Services\Demo;

class DemoAiResponseService
{
    public function respond(string $purpose, string $systemPrompt, string $userPrompt, array $options = []): string
    {
        $normalized = strtolower(trim($userPrompt . ' ' . ($options['hint'] ?? '')));

        if (preg_match('/\bplan\s+my\s+day\b/i', $normalized) === 1) {
            return 'I reviewed your schedule, KPIs, meetings, and pending work. Your prioritized daily plan is ready below — accept it to turn each segment into tasks for today.';
        }

        if (preg_match('/\b(overdue|pending)\s+task/i', $normalized) === 1 || preg_match('/\btask/i', $normalized) === 1) {
            return 'Here is a snapshot of your task workload. Focus on overdue items first, then today’s scheduled visits. Use the task list to start tracking when you head out.';
        }

        if (preg_match('/\b(lead|crm|follow[\s-]?up)/i', $normalized) === 1) {
            return 'Your CRM pipeline has active leads that need follow-up. I recommend prioritizing high-value prospects and scheduling visits for stale accounts.';
        }

        if (preg_match('/\b(meeting|calendar)/i', $normalized) === 1) {
            return 'You have meetings on your calendar today. Prepare talking points ahead of time and block travel time between field visits.';
        }

        if (preg_match('/\b(kpi|performance|target)/i', $normalized) === 1) {
            return 'Your assigned KPIs are in progress. Block time today for activities that move the needle on your highest-priority targets.';
        }

        if (preg_match('/\b(attendance|clock|shift)/i', $normalized) === 1) {
            return 'Your attendance record is up to date. Remember to clock in at the start of your field day and clock out when finished.';
        }

        if (preg_match('/\b(summary|today|activities)/i', $normalized) === 1) {
            return 'Today’s overview: review pending tasks, follow up on priority leads, attend scheduled meetings, and advance your KPI targets. Everything in this demo workspace is pre-loaded for a full walkthrough.';
        }

        if (preg_match('/\b(email|draft|outreach)/i', $normalized) === 1) {
            return "Subject: Following up on our last conversation\n\nHi there,\n\nI wanted to check in and see if you had any questions about our proposal. I'm available for a quick call or visit this week.\n\nBest regards";
        }

        if (preg_match('/\b(hello|hi|hey|help)/i', $normalized) === 1) {
            return 'Hello! I am ELY, your AI assistant. In this demo workspace you can explore daily planning, tasks, CRM, meetings, KPIs, and live map tracking — all without using paid AI credits.';
        }

        if ($purpose === 'analyst' || $purpose === 'report') {
            return 'Executive summary: field activity is healthy, follow-ups are due on several leads, and KPI progress is on track for the current period. Use the dashboard for live map and team performance views.';
        }

        return 'I can help with leads, tasks, meetings, attendance, KPIs, and daily planning. Try “Plan my day”, “Show overdue tasks”, or “Summarize today’s activities”.';
    }
}
