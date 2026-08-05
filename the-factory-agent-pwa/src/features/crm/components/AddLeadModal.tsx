'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';

import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { useCreateLead, useCrmPipelines, useCrmLabels, type LeadContact } from '@/features/crm';
import { PwaProfileUrlInputs, isValidUrl, normalizeWebsite, parseProfileUrls } from './PwaProfileUrlInputs';
import PhoneNumberInput from '@/components/ui/PhoneNumberInput';

interface AddLeadModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormState {
  companyName: string;
  website: string;
  position: string;
  source: string;
  status: string;
  pipelineId: string;
}

const INITIAL_FORM: FormState = {
  companyName: '',
  website: '',
  position: '',
  source: '',
  status: '',
  pipelineId: '',
};

export function AddLeadModal({ visible, onClose, onSuccess }: AddLeadModalProps): React.ReactElement | null {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [profileUrls, setProfileUrls] = useState<string[]>(['']);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState | 'profileUrls', string>>>({});

  // Multiple contacts state
  const [contacts, setContacts] = useState<LeadContact[]>([
    { name: '', email: '', phone: '', location: '' },
  ]);
  const [activeContactIndex, setActiveContactIndex] = useState(0);
  const [contactErrors, setContactErrors] = useState<Array<Partial<Record<'name' | 'email' | 'phone' | 'location', string>>>>([{}]);

  const { data: pipelines = [] } = useCrmPipelines();
  const { data: labels = [] } = useCrmLabels();
  
  const { mutate: createLead, isPending } = useCreateLead({
    onSuccess: () => {
      toast.success('Lead added');
      handleReset();
      onSuccess?.();
      onClose();
    },
  });

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setProfileUrls(['']);
    setErrors({});
    setContacts([{ name: '', email: '', phone: '', location: '' }]);
    setActiveContactIndex(0);
    setContactErrors([{}]);
  };

  const validate = (): boolean => {
    const newContactErrors: Array<Partial<Record<'name' | 'email' | 'phone' | 'location', string>>> = contacts.map(
      (c) => {
        const errs: Partial<Record<'name' | 'email' | 'phone' | 'location', string>> = {};
        if (!c.name.trim()) {
          errs.name = 'Name is required';
        }
        if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
          errs.email = 'Enter a valid email';
        }
        return errs;
      }
    );

    const newErrors: Partial<Record<keyof FormState | 'profileUrls', string>> = {};
    if (form.website.trim() && !isValidUrl(form.website)) {
      newErrors.website = 'Enter a valid website URL';
    }
    if (parseProfileUrls(profileUrls).some((url) => !isValidUrl(url))) {
      newErrors.profileUrls = 'One or more profile URLs are invalid';
    }

    setContactErrors(newContactErrors);
    setErrors(newErrors);

    const hasContactErrors = newContactErrors.some((e) => Object.keys(e).length > 0);
    const hasFieldErrors = Object.keys(newErrors).length > 0;

    if (hasContactErrors) {
      const errorIndex = newContactErrors.findIndex((e) => Object.keys(e).length > 0);
      if (errorIndex !== -1) {
        setActiveContactIndex(errorIndex);
      }
    }

    return !hasContactErrors && !hasFieldErrors;
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

    const normalizedContacts = contacts.map((contact, index) => ({
      name: contact.name.trim(),
      email: contact.email?.trim() || null,
      phone: contact.phone?.trim() || null,
      location: contact.location?.trim() || null,
      sort_order: index,
    }));
    const primaryContact = normalizedContacts[0];

    createLead({
      company_id: companyId,
      pipeline_id: pipelineId,
      name: primaryContact.name,
      email: primaryContact.email,
      phone: primaryContact.phone,
      location: primaryContact.location,
      contacts: normalizedContacts,
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
    handleReset();
    onClose();
  };

  const updateActiveContact = (key: keyof LeadContact, value: string) => {
    setContacts((current) =>
      current.map((item, idx) =>
        idx === activeContactIndex ? { ...item, [key]: value } : item
      )
    );
  };

  const addContact = () => {
    setContacts((current) => [
      ...current,
      { name: '', email: '', phone: '', location: '' },
    ]);
    setContactErrors((current) => [...current, {}]);
    setActiveContactIndex(contacts.length);
  };

  const removeContact = (indexToRemove: number) => {
    if (contacts.length <= 1) return;
    setContacts((current) => current.filter((_, idx) => idx !== indexToRemove));
    setContactErrors((current) => current.filter((_, idx) => idx !== indexToRemove));
    setActiveContactIndex((prev) => Math.max(0, Math.min(prev, contacts.length - 2)));
  };

  const currentContact = contacts[activeContactIndex] ?? contacts[0];
  const currentContactErrors = contactErrors[activeContactIndex] ?? {};
  const canGoBack = activeContactIndex > 0;
  const canGoForward = activeContactIndex < contacts.length - 1;

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
            {/* <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5 flex-shrink-0" /> */}

            <h3 className="text-lg font-bold text-white mb-5">
              Add New Lead
            </h3>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-4 overflow-y-auto pb-4">
              
              {/* Lead Contact Details Header / Separator */}
              <div className="flex items-center gap-3 my-2">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-center text-xs font-semibold text-white/50 tracking-wider">
                  Lead Contact Details
                </span>
                <button
                  type="button"
                  onClick={addContact}
                  aria-label="Add another contact"
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white transition hover:border-[#75ADAF] hover:bg-white/10 active:scale-95"
                >
                  <Plus size={14} />
                </button>
              </div>

              {/* Contact Paginator Slider Box */}
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                <button
                  type="button"
                  aria-label="Previous contact"
                  disabled={!canGoBack}
                  onClick={() => setActiveContactIndex(activeContactIndex - 1)}
                  className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                >
                  <ChevronLeft size={16} />
                </button>
                <div className="text-center">
                  <p className="text-xs font-bold text-white leading-snug">
                    Contact {activeContactIndex + 1} of {contacts.length}
                  </p>
                  <p className="text-[10px] text-[#75ADAF] leading-none mt-0.5">
                    {activeContactIndex === 0 ? 'Primary contact' : 'Additional contact'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {contacts.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove contact ${activeContactIndex + 1}`}
                      onClick={() => removeContact(activeContactIndex)}
                      className="rounded-lg p-1.5 text-red-400/80 transition hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Next contact"
                    disabled={!canGoForward}
                    onClick={() => setActiveContactIndex(activeContactIndex + 1)}
                    className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-20"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* Animated Form Fields container for active contact */}
              <div key={activeContactIndex} className="space-y-4">
                {/* Contact Name */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Name *</label>
                  <input
                    type="text"
                    placeholder="E.g John Doe"
                    value={currentContact.name}
                    onChange={(e) => updateActiveContact('name', e.target.value)}
                    className={`h-12 border-1.5 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF] ${
                      currentContactErrors.name ? 'border-[#EF4444]' : 'border-white/12'
                    }`}
                  />
                  {currentContactErrors.name && (
                    <span className="text-[#EF4444] text-[11px] mt-1 ml-1">{currentContactErrors.name}</span>
                  )}
                </div>

                {/* Contact Email */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Email</label>
                  <input
                    type="email"
                    placeholder="E.g john.doe@example.com"
                    value={currentContact.email ?? ''}
                    onChange={(e) => updateActiveContact('email', e.target.value)}
                    className={`h-12 border-1.5 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF] ${
                      currentContactErrors.email ? 'border-[#EF4444]' : 'border-white/12'
                    }`}
                  />
                  {currentContactErrors.email && (
                    <span className="text-[#EF4444] text-[11px] mt-1 ml-1">{currentContactErrors.email}</span>
                  )}
                </div>

                {/* Contact Phone */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 font-sans">Phone</label>
                  <PhoneNumberInput
                    value={currentContact.phone ?? ''}
                    onChange={(val) => updateActiveContact('phone', val)}
                    placeholder="E.g +44 555-0199"
                    defaultCountry="NG"
                  />
                </div>

                {/* Contact Location */}
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Location</label>
                  <input
                    type="text"
                    placeholder="E.g New York, USA"
                    value={currentContact.location ?? ''}
                    onChange={(e) => updateActiveContact('location', e.target.value)}
                    className="h-12 border-1.5 border-white/12 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF]"
                  />
                </div>
              </div>

              <div className="h-px bg-white/10 my-2" />
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
