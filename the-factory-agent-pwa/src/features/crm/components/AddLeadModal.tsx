'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { useCreateLead, useCrmPipelines, useCrmLabels } from '@/features/crm';
import { PwaProfileUrlInputs, isValidUrl, normalizeWebsite, parseProfileUrls } from './PwaProfileUrlInputs';

interface AddLeadModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  location: string;
  companyName: string;
  website: string;
  position: string;
  source: string;
  status: string;
  pipelineId: string;
}

const INITIAL_FORM: FormState = {
  name: '',
  email: '',
  phone: '',
  location: '',
  companyName: '',
  website: '',
  position: '',
  source: '',
  status: '',
  pipelineId: '',
};

const COUNTRY_CODES = [
  { code: "+44", label: "GB (+44)" },
  { code: "+234", label: "NG (+234)" },
  { code: "+254", label: "KE (+254)" },
  { code: "+233", label: "GH (+233)" },
  { code: "+27", label: "ZA (+27)" },
  { code: "+1", label: "US (+1)" },
] as const;

export function AddLeadModal({ visible, onClose, onSuccess }: AddLeadModalProps): React.ReactElement | null {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [countryCode, setCountryCode] = useState('+44');
  const [phonePart, setPhonePart] = useState('');
  const [profileUrls, setProfileUrls] = useState<string[]>(['']);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'profileUrls', string>>>({});

  const { data: pipelines = [] } = useCrmPipelines();
  const { data: labels = [] } = useCrmLabels();
  
  const { mutate: createLead, isPending } = useCreateLead({
    onSuccess: () => {
      toast.success('Lead added');
      setForm(INITIAL_FORM);
      setCountryCode('+234');
      setPhonePart('');
      setProfileUrls(['']);
      setErrors({});
      onSuccess?.();
      onClose();
    },
  });

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormState | 'profileUrls', string>> = {};
    if (!form.name.trim()) newErrors.name = 'Name is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Enter a valid email';
    }
    if (form.website.trim() && !isValidUrl(form.website)) {
      newErrors.website = 'Enter a valid website URL';
    }
    if (parseProfileUrls(profileUrls).some((url) => !isValidUrl(url))) {
      newErrors.profileUrls = 'One or more profile URLs are invalid';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const companyId = getActiveCompanyId();
    if (!companyId) {
      toast.error('Company context is missing. Please log in again.');
      return;
    }

    const defaultPipeline = pipelines[0];
    if (!defaultPipeline) {
      toast.error('No pipeline available. Contact your administrator.');
      return;
    }

    const pipelineId = form.pipelineId
      ? Number(form.pipelineId)
      : defaultPipeline.id;

    const defaultStatus = labels[0]?.slug ?? 'newly_lead';

    const cleanedProfileUrls = parseProfileUrls(profileUrls);

    createLead({
      company_id: companyId,
      pipeline_id: pipelineId,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: phonePart.trim() ? (countryCode + phonePart.trim()) : null,
      location: form.location.trim() || null,
      company_name: form.companyName.trim() || null,
      website: form.website.trim() ? normalizeWebsite(form.website) : null,
      position: form.position.trim() || null,
      profile_urls: cleanedProfileUrls.length > 0 ? cleanedProfileUrls : null,
      source: form.source.trim() || 'agent upload',
      status: form.status || defaultStatus,
    });
  };

  const handleClose = () => {
    if (isPending) return;
    setForm(INITIAL_FORM);
    setCountryCode('+234');
    setPhonePart('');
    setProfileUrls(['']);
    setErrors({});
    onClose();
  };

  return (
    <AnimatePresence>
      {visible && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 font-sans">
          {/* Backdrop Click */}
          <div className="absolute inset-0 z-0" onClick={handleClose} />

          {/* Bottom Sheet Modal */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="relative z-10 w-full max-w-md bg-[#0A1D25] rounded-t-3xl border-t border-white/10 px-6 pt-3 pb-8 max-h-[90vh] overflow-y-auto flex flex-col"
          >
            {/* Drag Handle representation */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5 flex-shrink-0" />

            <h3 className="text-lg font-bold text-white mb-5">
              Add New Lead
            </h3>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4 overflow-y-auto pb-4">
              {/* Name */}
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Full Name *</label>
                <input
                  type="text"
                  placeholder="Enter lead name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className={`h-12 border-1.5 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF] ${
                    errors.name ? 'border-[#EF4444]' : 'border-white/12'
                  }`}
                />
                {errors.name && (
                  <span className="text-[#EF4444] text-[11px] mt-1 ml-1">{errors.name}</span>
                )}
              </div>

              {/* Email */}
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Email</label>
                <input
                  type="email"
                  placeholder="Enter email address"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className={`h-12 border-1.5 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF] ${
                    errors.email ? 'border-[#EF4444]' : 'border-white/12'
                  }`}
                />
                {errors.email && (
                  <span className="text-[#EF4444] text-[11px] mt-1 ml-1">{errors.email}</span>
                )}
              </div>
              {/* Phone */}
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 font-sans">Phone</label>
                <div className="flex gap-2 w-full">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="h-12 border-1.5 border-white/12 rounded-xl px-3 text-sm text-white bg-[#0A1D25] outline-none transition-colors focus:border-[#75ADAF]"
                    style={{ backgroundColor: '#0A1D25' }}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code} style={{ backgroundColor: '#0A1D25' }}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    placeholder="Enter phone number"
                    value={phonePart}
                    onChange={(e) => setPhonePart(e.target.value)}
                    className="flex-1 h-12 border-1.5 border-white/12 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF]"
                  />
                </div>
              </div>
              {/* Location */}
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Location</label>
                <input
                  type="text"
                  placeholder="Enter location"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className="h-12 border-1.5 border-white/12 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF]"
                />
              </div>

              <p className="text-[10px] text-white/45 -mt-1">Company & professional fields below are optional.</p>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Company Name</label>
                <input
                  type="text"
                  placeholder="Enter company name"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                  className="h-12 border-1.5 border-white/12 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF]"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Website</label>
                <input
                  type="url"
                  placeholder="https://company.com"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  className={`h-12 border-1.5 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF] ${
                    errors.website ? 'border-[#EF4444]' : 'border-white/12'
                  }`}
                />
                {errors.website && (
                  <span className="text-[#EF4444] text-[11px] mt-1 ml-1">{errors.website}</span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Position</label>
                <input
                  type="text"
                  placeholder="E.g Head of Sales"
                  value={form.position}
                  onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                  className="h-12 border-1.5 border-white/12 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF]"
                />
              </div>

              <PwaProfileUrlInputs values={profileUrls} onChange={setProfileUrls} />
              {errors.profileUrls && (
                <span className="text-[#EF4444] text-[11px] -mt-2 ml-1">{errors.profileUrls}</span>
              )}

              {/* Source */}
              <div className="flex flex-col">
                <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Source</label>
                <input
                  type="text"
                  placeholder="e.g. Referral, Social Media"
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  className="h-12 border-1.5 border-white/12 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF]"
                />
              </div>

              {/* Status pills selection */}
              {labels.length > 0 && (
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Status</label>
                  <div className="flex overflow-x-auto pb-1 gap-2 scrollbar-none">
                    {labels.map((label) => {
                      const isSelected = form.status === label.slug;
                      return (
                        <button
                          key={label.slug}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, status: label.slug }))}
                          className="px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors outline-none focus:outline-none"
                          style={{
                            backgroundColor: isSelected ? label.color : 'rgba(255,255,255,0.08)',
                            color: isSelected ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
                          }}
                        >
                          {label.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pipeline selection */}
              {pipelines.length > 1 && (
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Pipeline</label>
                  <div className="flex overflow-x-auto pb-1 gap-2 scrollbar-none">
                    {pipelines.map((pipeline) => {
                      const isSelected = form.pipelineId === String(pipeline.id);
                      return (
                        <button
                          key={pipeline.id}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, pipelineId: String(pipeline.id) }))}
                          className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors outline-none focus:outline-none ${
                            isSelected ? 'bg-[#7BB6B8] text-white' : 'bg-white/8 text-white/60'
                          }`}
                        >
                          {pipeline.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="flex-1 h-12 rounded-xl bg-white/8 text-white font-semibold text-sm transition-colors hover:bg-white/12 active:scale-95 disabled:opacity-45"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 h-12 rounded-xl bg-[#FD6046] hover:bg-[#E0533C] text-white font-semibold text-sm flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50"
                >
                  {isPending ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    'Add Lead'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
