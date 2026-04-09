'use client';

import { useState, useRef } from 'react';
import { X, Upload, User, Phone, Mail, MapPin, Briefcase, DollarSign, ChevronDown } from 'lucide-react';

const ZONE_OPTIONS = ['Ikeja LGA', 'Surulere LGA', 'Lekki LGA', 'Victoria Island', 'Yaba LGA', 'Oshodi LGA'];
const SUPERVISOR_OPTIONS = ['Tunde Balogun', 'Ridwan Thomson', 'Amaka Osei'];
const WORK_DAYS_OPTIONS = ['Mon–Fri', 'Mon–Sat', 'Tue–Sat', 'Wed–Sun', 'Custom'];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const EMPTY_FORM = {
  name: '',
  gender: '' as 'Male' | 'Female' | '',
  phone: '',
  email: '',
  role: '' as 'Supervisor' | 'Field Agent' | '',
  supervisor: '',
  zone: '',
  workDays: 'Mon–Fri',
  customDays: [] as string[],
  baseSalary: '',
  commissionEnabled: false,
};

type FormState = typeof EMPTY_FORM;

const BASE_INPUT = 'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-[13px] text-dash-dark outline-none focus:ring-2 focus:ring-dash-teal/20 focus:border-dash-teal/40 transition-all placeholder:text-gray-300';
const WITH_ICON = 'pl-9';

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wide block mb-1.5">{children}</label>;
}

function InputIcon({ children }: { children: React.ReactNode }) {
  return <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">{children}</div>;
}

export function AddAgentModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const toggleCustomDay = (day: string) => {
    setForm((f) => ({
      ...f,
      customDays: f.customDays.includes(day)
        ? f.customDays.filter((d) => d !== day)
        : [...f.customDays, day],
    }));
  };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // wire up to real API here
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl z-10 flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 duration-300">

        {/* Header — fixed */}
        <div className="flex items-center justify-between px-7 pt-6 pb-5 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-[18px] font-bold text-dash-dark">Add New Agent</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">Fill in the details below to onboard an agent</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Body — scrollable */}
        <form onSubmit={handleSubmit} id="add-agent-form" className="px-7 py-6 space-y-5 overflow-y-auto flex-1 min-h-0">

          {/* ── Profile Photo ─────────────────────────── */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 overflow-hidden flex items-center justify-center">
                {avatarPreview ? (
                  <img src={avatarPreview} className="w-full h-full object-cover" alt="preview" />
                ) : (
                  <User size={20} className="text-gray-300" />
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#09232d] rounded-full flex items-center justify-center shadow"
              >
                <Upload size={11} className="text-white" />
              </button>
            </div>
            <div>
              <p className="text-[13px] font-bold text-dash-dark">Profile Photo</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Auto-generated avatar set. You can upload a custom photo.</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-2 px-3 py-1.5 rounded-full border border-gray-200 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Upload Photo
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          </div>

          {/* ── Full Name ─────────────────────────────── */}
          <div>
            <Label>Full Name</Label>
            <div className="relative">
              <InputIcon><User size={13} /></InputIcon>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Abdul Kareem Lawal"
                className={`${BASE_INPUT} ${WITH_ICON}`}
              />
            </div>
          </div>

          {/* ── Gender ────────────────────────────────── */}
          <div>
            <Label>Gender</Label>
            <div className="flex gap-2">
              {(['Male', 'Female'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('gender', g)}
                  className={`flex-1 py-3 rounded-xl text-[13px] font-bold transition-all border-2 ${
                    form.gender === g
                      ? 'bg-[#09232d] text-white border-dash-dark'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* ── Phone + Email ─────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Phone Number</Label>
              <div className="relative">
                <InputIcon><Phone size={13} /></InputIcon>
                <input
                  required
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="+234 803 000 0000"
                  className={`${BASE_INPUT} ${WITH_ICON}`}
                />
              </div>
            </div>
            <div>
              <Label>Email Address</Label>
              <div className="relative">
                <InputIcon><Mail size={13} /></InputIcon>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="e.g. name@company.com"
                  className={`${BASE_INPUT} ${WITH_ICON}`}
                />
              </div>
            </div>
          </div>

          {/* ── Role ──────────────────────────────────── */}
          <div>
            <Label>Role</Label>
            <div className="relative">
              <InputIcon><Briefcase size={13} /></InputIcon>
              <select
                required
                value={form.role}
                onChange={(e) => set('role', e.target.value as FormState['role'])}
                className={`${BASE_INPUT} ${WITH_ICON} pr-9 appearance-none cursor-pointer`}
              >
                <option value="" disabled>Select role</option>
                <option>Supervisor</option>
                <option>Field Agent</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <ChevronDown size={13} />
              </div>
            </div>
          </div>

          {/* ── Supervisor (Field Agent only) ─────────── */}
          {form.role === 'Field Agent' && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-200">
              <Label>Supervisor</Label>
              <div className="relative">
                <InputIcon><User size={13} /></InputIcon>
                <select
                  required
                  value={form.supervisor}
                  onChange={(e) => set('supervisor', e.target.value)}
                  className={`${BASE_INPUT} ${WITH_ICON} pr-9 appearance-none cursor-pointer`}
                >
                  <option value="" disabled>Select supervisor</option>
                  {SUPERVISOR_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  <ChevronDown size={13} />
                </div>
              </div>
            </div>
          )}

          {/* ── Assigned Zone ─────────────────────────── */}
          <div>
            <Label>Assigned Zone</Label>
            <div className="relative">
              <InputIcon><MapPin size={13} /></InputIcon>
              <select
                required
                value={form.zone}
                onChange={(e) => set('zone', e.target.value)}
                className={`${BASE_INPUT} ${WITH_ICON} pr-9 appearance-none cursor-pointer`}
              >
                <option value="" disabled>Select zone</option>
                {ZONE_OPTIONS.map((z) => <option key={z}>{z}</option>)}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <ChevronDown size={13} />
              </div>
            </div>
          </div>

          {/* ── Work Days ─────────────────────────────── */}
          <div>
            <Label>Work Days</Label>
            <div className="flex flex-wrap gap-2">
              {WORK_DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('workDays', d)}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all border ${
                    form.workDays === d
                      ? 'bg-[#09232d] text-white border-dash-dark'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            {form.workDays === 'Custom' && (
              <div className="flex gap-2 mt-3 flex-wrap animate-in fade-in duration-200">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleCustomDay(d)}
                    className={`w-10 h-10 rounded-full text-[12px] font-bold transition-all border ${
                      form.customDays.includes(d)
                        ? 'bg-[#09232d] text-white border-dash-dark'
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Base Salary + Commission ───────────────── */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Base Salary</Label>
              <div className="relative">
                <InputIcon><DollarSign size={13} /></InputIcon>
                <input
                  type="text"
                  value={form.baseSalary}
                  onChange={(e) => set('baseSalary', e.target.value.replace(/[^0-9,]/g, ''))}
                  placeholder="e.g. 120,000"
                  className={`${BASE_INPUT} ${WITH_ICON}`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-gray-400">₦</span>
              </div>
            </div>

            <div>
              <Label>Commission Enabled</Label>
              <div
                onClick={() => set('commissionEnabled', !form.commissionEnabled)}
                className={`mt-0.5 flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all select-none h-11.5 ${
                  form.commissionEnabled
                    ? 'bg-[#09232d] border-dash-dark'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${form.commissionEnabled ? 'bg-white/20' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full shadow transition-all ${
                    form.commissionEnabled ? 'left-4 bg-white' : 'left-0.5 bg-white'
                  }`} />
                </div>
                <span className={`text-[12px] font-bold ${form.commissionEnabled ? 'text-white' : 'text-gray-500'}`}>
                  {form.commissionEnabled ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
          </div>

        </form>

        {/* Footer — fixed */}
        <div className="px-7 py-5 border-t border-gray-100 shrink-0 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-full border border-gray-200 text-[13px] font-bold text-gray-500 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-agent-form"
            className="flex-1 py-3 rounded-full bg-[#09232d] text-white text-[13px] font-bold hover:opacity-90 transition-all shadow-lg"
          >
            Add Agent
          </button>
        </div>
      </div>
    </div>
  );
}
