"use client";

import ArrowUp from "@/assets/images/arrow-57deg.png";
import { useDashboardOverview } from "@/hooks/use-dashboard";
import { useLeadPipeline } from "@/hooks/use-crm";
import { getActiveCompanyContext } from "@/lib/company-context";
import {
  buildCalibratedLeadsTrendChart,
  hasLeadsTrendData,
  LEADS_TREND_BAR_COLORS,
} from "@/lib/dashboard-leads-chart";
import { useAuthStore } from "@/store/auth";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TinyButton } from "../ui/tiny-button";

const LEADS_CHART_MIN_DOMAIN = 4;

export function MyActivitiesChart() {
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const basePath = role === "agent" ? "/agent" : "/admin";

  const { data: overview } = useDashboardOverview({
    company_id: companyId ?? undefined,
    basePath,
  });

  const metric = overview?.activity_metric;
  const activityScore = metric?.activity_score ?? 0;
  const direction = metric?.direction ?? "flat";
  // Agents see their own actions; managers see the whole team's.
  const isTeam = (metric?.scope ?? (role === "agent" ? "self" : "team")) === "team";
  const cardTitle = isTeam ? "Team Activity" : "My Activities";
  const scoreHint = metric
    ? `${metric.current_week.toLocaleString()} actions this week · ${metric.previous_week.toLocaleString()} by this time last week`
    : undefined;

  const activityValue = `${activityScore > 0 ? "+" : ""}${Math.round(activityScore)}%`;

  // This week's daily actions, with last week's faintly behind for comparison.
  const chartData = useMemo(() => {
    const current = metric?.current_week_daily ?? [];
    const previous = metric?.previous_week_daily ?? [];
    return current.map((point, index) => ({
      name: point.name,
      value: point.value,
      previous: previous[index]?.value ?? 0,
    }));
  }, [metric?.current_week_daily, metric?.previous_week_daily]);

  const hasData = chartData.some((item) => item.value > 0 || item.previous > 0);

  const referenceLine =
    hasData
      ? Math.round(
        chartData.reduce((sum, item) => sum + item.value, 0) / chartData.length
      )
      : 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full" />;

  return (
    <div className="bg-[#78B3B3] rounded-3xl w-full py-6 text-white h-full flex flex-col relative overflow-hidden shadow-2xl">
      <div className="flex justify-between items-start relative z-10 px-8.5">
        <div>
          <h3 className="text-white/80 text-[13px] font-bold tracking-tight">
            {cardTitle}
          </h3>
          <div className="flex items-center gap-2 mt-0.5" title={scoreHint}>
            <span className="text-4xl font-bold tracking-tighter leading-9">
              {activityValue}
            </span>
            <Image
              src={ArrowUp}
              alt="Arrow Up Right Icon"
              width={18}
              height={18}
              className={`self-end pb-1.5 ${direction === "down" ? "rotate-90 [filter:brightness(0)_saturate(100%)_invert(24%)_sepia(87%)_saturate(2642%)_hue-rotate(338deg)_brightness(97%)_contrast(104%)]" : ""}`}
            />
          </div>
          <p className="text-white/70 text-[10px] font-medium mt-0.5" title={scoreHint}>
            vs same time last week
          </p>
        </div>
      </div>

      <div className="flex-1 w-full min-h-25 mt-2 relative z-10">
        {hasData ? (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minHeight={0}
            minWidth={0}
          >
            <AreaChart
              data={chartData}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="white" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="white" stopOpacity={0} />
                </linearGradient>
              </defs>
              <ReferenceLine
                y={referenceLine}
                stroke="white"
                strokeDasharray="3 3"
                strokeOpacity={0.4}
              />
              <Tooltip
                cursor={false}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", color: "#0B1215" }}
                formatter={(value, name) => [
                  `${value} actions`,
                  name === "previous" ? "Last week" : "This week",
                ]}
              />
              <Area
                type="monotone"
                dataKey="previous"
                stroke="white"
                strokeOpacity={0.35}
                strokeWidth={2}
                strokeDasharray="4 4"
                fill="none"
                dot={false}
                activeDot={false}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="white"
                strokeWidth={4}
                fillOpacity={1}
                fill="url(#colorValue)"
                dot={false}
                activeDot={{ r: 6, fill: "white", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center">
            <div className="w-full h-0.75 rounded-full bg-white opacity-50" />
          </div>
        )}
      </div>

      {/* Decorative dashed lines spanning the card */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute left-[30%] top-0 bottom-0 border-l border-dashed border-white" />
        <div className="absolute left-0 right-0 top-[60%] border-t border-dashed border-white" />
      </div>
    </div>
  );
}

export function TotalLeadsChart() {
  const [mounted, setMounted] = useState(false);
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  const basePath = role === "agent" ? "/agent" : "/admin";
  const isAgent = role === "agent";

  const { data: overview, isLoading: overviewLoading } = useDashboardOverview({
    company_id: companyId ?? undefined,
    basePath,
  });

  const { data: pipeline, isLoading: pipelineLoading } = useLeadPipeline(
    !isAgent ? (companyId ?? undefined) : undefined,
    basePath,
  );

  // Managers: every lead in the company, all pipelines.
  // Agents: leads they created or are assigned to (same scope as the agent CRM page).
  const totalLeads = isAgent
    ? (overview?.kpis?.total_leads ?? 0)
    : (pipeline?.total ?? overview?.kpis?.total_leads ?? 0);

  const isLoading = isAgent ? overviewLoading : pipelineLoading;

  const leadsChartData = useMemo(
    () => buildCalibratedLeadsTrendChart(overview?.leads_trend ?? []),
    [overview?.leads_trend],
  );

  const hasLeadsTrend = hasLeadsTrendData(overview?.leads_trend ?? []);
  const showLeadsChart = hasLeadsTrend || (!isLoading && totalLeads > 0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full" />;

  return (
    <div className="bg-white rounded-3xl px-7 py-3.75 text-dash-dark h-full flex flex-col shadow-2xl relative">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="text-dash-dark text-[16px] font-semibold leading-tight">
            Total Leads
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-4xl font-bold tracking-tighter leading-none">
              {isLoading ? "—" : totalLeads.toLocaleString()}
            </span>
            <span className="text-dash-dark/40 text-sm font-bold mt-2">
              {isAgent ? "My leads" : "Leads"}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <TinyButton>View</TinyButton>
          {/* Bars = last 6 days (today on the right), not the total above. */}
          <div className="flex flex-col items-end gap-0.5 text-[9px] font-medium text-dash-dark/50 whitespace-nowrap">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: LEADS_TREND_BAR_COLORS.rise }} />
              New / day
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: LEADS_TREND_BAR_COLORS.fall }} />
              Won / day
            </span>
          </div>
        </div>
      </div>

      {/* Fills the rest of the card so the bars and the weekday labels always fit. */}
      <div className="w-full flex-1 min-h-11">
        {showLeadsChart ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={leadsChartData}
              barGap={4}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <YAxis
                domain={[0, (dataMax: number) => Math.max(LEADS_CHART_MIN_DOMAIN, dataMax)]}
                hide
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                interval={0}
                tick={{ fontSize: 9, fill: "#9CA3AF" }}
                tickMargin={2}
                height={16}
                padding={{ left: 0, right: 0 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(11,18,21,0.04)" }}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}
                formatter={(value, name) => [value, name === "v2" ? "Won" : "New leads"]}
              />
              <Bar
                dataKey="v1"
                name="v1"
                fill={LEADS_TREND_BAR_COLORS.rise}
                radius={10}
                barSize={15}
              />
              <Bar
                dataKey="v2"
                name="v2"
                fill={LEADS_TREND_BAR_COLORS.fall}
                radius={10}
                barSize={15}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full flex items-center">
            <div className="w-full h-0.75 rounded-full bg-dash-dark/15" />
          </div>
        )}
      </div>
    </div>
  );
}
