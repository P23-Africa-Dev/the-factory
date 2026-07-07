'use client';

import Link from 'next/link';
import { ArrowLeft, Search, SlidersHorizontal, ChevronLeft, ChevronRight, MapPin, Loader2, FileText, RefreshCw, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { OpsTableRow, OpsTableNameCol, OpsTableCol, OpsTableStatus, OpsTableContainer } from '@/components/operations/ops-table';
import { useAttendanceMetrics, useAttendanceRecords, usePayrollSummaries, useGeneratePayrollSummaries } from '@/hooks/use-attendance';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import {
  mapManagementAttendanceRecord,
  type ManagementAttendanceListItem,
} from '@/lib/attendance-management-ui';
import { SearchableSelect } from "@/components/ui/searchable-select";

type AttendanceItem = ManagementAttendanceListItem;

const SPARK_PRESENT = [{ v: 8 }, { v: 14 }, { v: 10 }, { v: 18 }, { v: 12 }, { v: 16 }, { v: 20 }];
const SPARK_ABSENT = [{ v: 20 }, { v: 14 }, { v: 18 }, { v: 10 }, { v: 16 }, { v: 12 }, { v: 8 }];

function StatCard({
  value,
  label,
  accentBg,
  strokeColor,
  gradientId,
  data,
  isLoading,
}: {
  value: number;
  label: string;
  accentBg: string;
  strokeColor: string;
  gradientId: string;
  data: { v: number }[];
  isLoading: boolean;
}) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col min-h-44 overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-1">
        {isLoading ? (
          <div className="w-24 h-14 bg-gray-100 animate-pulse rounded-xl" />
        ) : (
          <h2 className="text-[56px] font-bold text-[#1A1A1A] leading-none tracking-tight">{value}</h2>
        )}
        <div
          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-bold text-white shrink-0 mt-2"
          style={{ background: accentBg }}
        >
          Today
          <ArrowUpRight size={11} />
        </div>
      </div>
      <p className="text-[14px] font-medium text-gray-500 mb-auto">{label}</p>
      <div className="h-16 w-full mt-3 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={strokeColor} strokeWidth={2.5} fill={`url(#${gradientId})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const PAGE_SIZE = 5;

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function AttendanceSidebar({ record }: { record: AttendanceItem }) {
  return (
    <div className="flex flex-col gap-5 w-full xl:w-90 xl:shrink-0">
      {/* Info */}
      <div>
        <div className="flex flex-col sm:flex-row xl:flex-col gap-6">
          <div className="flex sm:flex-row xl:flex-row items-start gap-6">
            <div className="flex-1 space-y-4 min-w-0">
              <div>
                <h3 className="text-[17px] font-bold text-dash-dark">{record.name}</h3>
                <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">{record.address}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Zone / Location</p>
                <p className="text-[13px] text-gray-400">{record.zone}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Role</p>
                <p className="text-[13px] text-gray-400">{record.role}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Check-In</p>
                <p className="text-[13px] text-gray-400">{record.checkIn}</p>
              </div>
            </div>
            <div className="shrink-0 w-36">
              <div className="w-36 h-44 rounded-3xl overflow-hidden shadow-lg bg-[#C9A84C]">
                <img src={record.avatar} className="w-full h-full object-cover" alt={record.name} />
              </div>
              <div className="mt-2 text-center">
                <p className="text-[12px] font-bold text-dash-dark">{record.name}</p>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${record.active ? 'bg-[#1A452C] text-[#4ADE80]' : 'bg-[#F48243]/20 text-[#F48243]'
                    }`}>
                    {record.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tracking card */}
      {/* <div className="bg-dash-dark rounded-4xl p-6 shadow-2xl">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 font-bold mb-0.5">Check-In Time</p>
            <p className="text-[15px] font-bold text-white">{record.checkIn}</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 font-bold mb-0.5">Check-Out Time</p>
            <p className="text-[13px] font-medium text-white/70">{record.checkOut}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold shrink-0 self-start ${record.active ? 'bg-[#1A452C] text-[#4ADE80]' : 'bg-gray-700 text-gray-300'
            }`}>
            {record.active ? 'On-Time' : 'Absent'}
          </div>
        </div>

        <div className="mb-4">
          <p className="text-[15px] font-bold text-white mb-0.5">Location (Check-In)</p>
          <p className="text-[12px] text-gray-400">{record.address}</p>
        </div>

        <div className="relative h-44 w-full rounded-[18px] bg-[#e8ecef] overflow-hidden">
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50">
            <defs>
              <pattern id="attpage-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#attpage-grid)" />
          </svg>
          <div className="absolute left-[30%] top-0 bottom-0 w-9 bg-white/60 pointer-events-none" />
          <div className="absolute top-[48%] left-0 right-0 h-8 bg-white/60 pointer-events-none" />
          <div className="absolute right-0 top-[28%] w-10 h-14 bg-[#A8D5B5]/60 pointer-events-none" />
          <div className="absolute pointer-events-none" style={{ left: '28%', top: 6 }}>
            <span className="text-[8px] font-semibold text-gray-600 block leading-tight">Dresd</span>
            <span className="text-[8px] font-semibold text-gray-600 block leading-tight">Street</span>
          </div>
          <div className="absolute right-1 top-[16%] pointer-events-none">
            <span className="text-[7px] font-semibold text-gray-500 block leading-tight">McDow</span>
            <span className="text-[7px] font-semibold text-gray-500 block leading-tight">ell Str</span>
          </div>
          <div className="absolute" style={{ left: '32%', top: '25%' }}>
            <MapPin size={20} className="text-red-500 fill-red-500 drop-shadow-md" />
          </div>
          <div className="absolute flex flex-col items-center" style={{ left: 'calc(32% - 14px)', top: '48%' }}>
            <div className="w-7 h-7 rounded-full border-2 border-white shadow-md overflow-hidden">
              <img src={record.avatar} className="w-full h-full object-cover" alt="Agent" />
            </div>
            <div className="bg-white px-2 py-0.5 rounded-lg mt-1 whitespace-nowrap shadow-md">
              <p className="text-[8px] font-bold text-dash-dark">{record.name}</p>
              <p className="text-[7px] text-gray-400">Active at Kemsi Street</p>
            </div>
          </div>
        </div>
      </div> */}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function AttendanceRow({ item, isSelected, onClick }: { item: AttendanceItem; isSelected: boolean; onClick: () => void }) {
  return (
    <OpsTableRow isSelected={isSelected} onClick={onClick} avatar={item.avatar} avatarAlt={item.name}>
      <OpsTableNameCol name={item.name} subText={item.address} isSelected={isSelected} />
      <OpsTableCol label="Check-In" value={item.checkIn} isSelected={isSelected} className="hidden sm:block w-28 sm:w-32" />
      <OpsTableCol label="Check-Out" value={item.checkOut} isSelected={isSelected} className="hidden md:block w-36 sm:w-40" />
      <OpsTableCol label="Zone" value={item.zone} isSelected={isSelected} className="hidden lg:block w-28 sm:w-32" />
      <OpsTableStatus
        label={item.status}
        subText={item.subText}
        isSelected={isSelected}
        badgeClass={item.status === 'Present' ? 'bg-[#2F6C0E] text-white' : 'bg-[#EF7129] text-white'}
      />
    </OpsTableRow>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AttendanceListPage() {
  const today = format(new Date(), 'yyyy-MM-dd');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'late' | 'clocked_out' | 'absent'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'agent' | 'supervisor'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [date, setDate] = useState(today);

  const now = new Date();
  const [payrollYear, setPayrollYear] = useState(now.getFullYear());
  const [payrollMonth, setPayrollMonth] = useState(now.getMonth() + 1);

  const { user } = useAuthStore();
  const { apiCompanyId } = getActiveCompanyContext(user);

  const apiStatus = statusFilter === 'all' ? undefined : statusFilter;
  const apiRole = roleFilter === 'all' ? undefined : roleFilter;

  const { data: metricsData } = useAttendanceMetrics(apiCompanyId ?? undefined, date);

  const { data: payrollData, isLoading: payrollLoading } = usePayrollSummaries({
    company_id: apiCompanyId ?? undefined,
    year: payrollYear,
    month: payrollMonth,
  });

  const generatePayroll = useGeneratePayrollSummaries();

  const { data: recordsData, isLoading } = useAttendanceRecords({
    company_id: apiCompanyId ?? undefined,
    date,
    status: apiStatus,
    role: apiRole,
    search: search || undefined,
    per_page: PAGE_SIZE,
    page,
  });

  const allRecords: AttendanceItem[] = (recordsData?.items ?? []).map(mapManagementAttendanceRecord);
  const pagination = recordsData?.pagination;
  const totalPages = Math.max(1, pagination?.last_page ?? 1);
  const currentPage = pagination?.current_page ?? page;
  const paginated = allRecords;

  const presentCount = metricsData?.present ?? 0;
  const absentCount = metricsData?.absent ?? 0;

  const activeId = selectedId ?? (paginated[0]?.id ?? null);
  const selectedRecord = paginated.find((a) => a.id === activeId) ?? paginated[0] ?? null;

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleDateChange = (val: string) => { setDate(val); setPage(1); setSelectedId(null); };
  const handleStatus = (s: 'all' | 'present' | 'late' | 'clocked_out' | 'absent') => { setStatusFilter(s); setPage(1); };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-350 mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/operations?tab=attendance" className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm hover:shadow-md transition-all">
            <ArrowLeft size={18} className="text-dash-dark" />
          </Link>
          <div>
            <h1 className="text-[22px] font-bold text-dash-dark">Attendance List</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">{allRecords.length} records found</p>
          </div>
          <div className="ml-auto">
            <input
              type="date"
              value={date}
              onChange={(e) => handleDateChange(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-[13px] text-dash-dark outline-none focus:ring-2 focus:ring-dash-dark/10 shadow-sm"
            />
          </div>
        </div>

        {/* Stat Cards */}
        {/* <div className="grid grid-cols-2 gap-4 mb-6">
          <StatCard
            value={presentCount}
            label="Present Agents Today"
            accentBg="#4BB89E"
            strokeColor="#4BB89E"
            gradientId="pageGradPresent"
            data={SPARK_PRESENT}
            isLoading={!metricsData && isLoading}
          />
          <StatCard
            value={absentCount}
            label="Absent Agents Today"
            accentBg="#EF7129"
            strokeColor="#EF7129"
            gradientId="pageGradAbsent"
            data={SPARK_ABSENT}
            isLoading={!metricsData && isLoading}
          />
        </div> */}

        {/* Search + Filter */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-dark transition-colors" size={17} />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name or address..."
              className="w-full bg-white border border-gray-100 rounded-full py-3.5 pl-12 pr-5 text-[13px] outline-none focus:ring-2 focus:ring-dash-dark/20 transition-all shadow-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3.5 rounded-full text-[13px] font-bold transition-all shadow-sm border ${showFilters ? 'bg-dash-dark text-white border-dash-dark' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
              }`}
          >
            <SlidersHorizontal size={14} />
            <span>Filter</span>
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 mb-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-400 px-1">Status</label>
              <div className="flex gap-1">
                {(['all', 'present', 'late', 'clocked_out', 'absent'] as const).map((s) => (
                  <button key={s} onClick={() => handleStatus(s)}
                    className={`px-4 py-2 rounded-full text-[12px] font-bold capitalize transition-all ${statusFilter === s ? 'bg-dash-dark text-white' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'
                      }`}>
                    {s === 'all' ? 'All' : s === 'clocked_out' ? 'Clocked Out' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-400 px-1">Role</label>
              <SearchableSelect
                value={roleFilter}
                onChange={(v) => { setRoleFilter(v as 'all' | 'admin' | 'agent' | 'supervisor'); setPage(1); }}
                options={[{ value: "all", label: "All Roles" }, { value: "admin", label: "Admin" }, { value: "agent", label: "Field Agent" }, { value: "supervisor", label: "Supervisor" }]}
                className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark cursor-pointer"
              />
            </div>
            {(statusFilter !== 'all' || roleFilter !== 'all') && (
              <div className="flex flex-col justify-end">
                <button onClick={() => { setStatusFilter('all'); setRoleFilter('all'); setPage(1); }}
                  className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200">
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* List + Sidebar */}
        <div className="flex flex-col xl:flex-row gap-6">

          {/* List */}
          <OpsTableContainer className="flex-1 min-w-0 flex flex-col h-140">
            {/* Scrollable rows */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 size={24} className="animate-spin text-gray-400" />
                </div>
              ) : paginated.length === 0 ? (
                <div className="py-16 text-center text-gray-400 text-[14px] font-medium">No records match your search.</div>
              ) : (
                <div className="space-y-3">
                  {paginated.map((item) => (
                    <AttendanceRow
                      key={item.id}
                      item={item}
                      isSelected={activeId === item.id}
                      onClick={() => setSelectedId(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="shrink-0 flex items-center justify-between mt-4 pt-5 border-t border-gray-100">
                <p className="text-[12px] text-gray-400">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, pagination?.total ?? allRecords.length)} of {pagination?.total ?? allRecords.length}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronLeft size={15} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-9 h-9 rounded-full text-[13px] font-bold transition-all ${p === currentPage ? 'bg-dash-dark text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100'}`}>
                      {p}
                    </button>
                  ))}
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </OpsTableContainer>

          {/* Sidebar */}
          {selectedRecord ? (
            <AttendanceSidebar record={selectedRecord} />
          ) : (
            <div className="flex items-center justify-center w-full xl:w-90 xl:shrink-0 h-40 text-gray-400 text-[13px]">
              Select a record to view details
            </div>
          )}
        </div>

        {/* ── Payroll Summaries ─────────────────────────────────────── */}
        <div className="mt-8 pt-8 border-t border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-dash-dark flex items-center justify-center">
                <FileText size={14} className="text-white" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-dash-dark">Payroll Summaries</h2>
                <p className="text-[12px] text-gray-400">Monthly attendance payroll data</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Month/Year pickers */}
              <SearchableSelect
                value={String(payrollMonth)}
                onChange={(v) => setPayrollMonth(Number(v))}
                options={["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((m, i) => ({ value: String(i + 1), label: m }))}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-dash-dark shadow-sm"
              />
              <input
                type="number"
                value={payrollYear}
                onChange={(e) => setPayrollYear(Number(e.target.value))}
                min={2020}
                max={2099}
                className="w-24 bg-white border border-gray-200 rounded-xl px-3 py-2 text-[13px] text-dash-dark outline-none focus:ring-2 focus:ring-dash-dark/10 shadow-sm"
              />
              {/* Generate button */}
              <button
                onClick={() => {
                  if (!apiCompanyId) return;
                  generatePayroll.mutate(
                    { company_id: apiCompanyId, year: payrollYear, month: payrollMonth },
                    {
                      onSuccess: () => toast.success("Payroll summaries generated."),
                      onError: (err: Error) => toast.error(err.message || "Failed to generate payroll."),
                    }
                  );
                }}
                disabled={generatePayroll.isPending || !apiCompanyId}
                className="flex items-center gap-2 px-4 py-2.5 bg-dash-dark text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {generatePayroll.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                <span className="hidden sm:inline">Generate</span>
              </button>
            </div>
          </div>

          {/* Summaries table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {payrollLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : !payrollData?.summaries?.length ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <FileText size={32} className="text-gray-200" />
                <p className="text-[13px] text-gray-400 font-medium">No payroll summaries for this period.</p>
                <p className="text-[12px] text-gray-300">Click Generate to create them.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80">
                      {Object.keys(payrollData.summaries[0] ?? {})
                        .filter((k) => typeof (payrollData.summaries[0] as Record<string, unknown>)[k] !== "object" || (payrollData.summaries[0] as Record<string, unknown>)[k] === null)
                        .map((col) => (
                          <th key={col} className="px-4 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                            {col.replace(/_/g, " ")}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {payrollData.summaries.map((summary, i) => {
                      const cols = Object.entries(summary as Record<string, unknown>)
                        .filter(([, v]) => typeof v !== "object" || v === null);
                      return (
                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                          {cols.map(([k, v]) => (
                            <td key={k} className="px-4 py-3 text-[13px] text-dash-dark font-medium whitespace-nowrap">
                              {v === null || v === undefined ? "—" : String(v)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
