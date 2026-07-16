'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, X } from 'lucide-react';

import type { Task } from '@/features/tasks/types';
import { taskApi } from '@/features/tasks/api';
import { useActiveTracking, useGeolocation, buildCompleteFormData } from '@/features/tracking';
import { getDb } from '@/lib/db/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { syncEngine } from '@/lib/sync/syncEngine';
import { toast } from '@/lib/toast';
import {
  resolveCompletionRequirements,
  validateCompletionRequirements,
} from '../completionRequirements';

export type CompleteRequirementsSheetProps = {
  visible: boolean;
  taskId: number;
  task: Task | null | undefined;
  hasArrived: boolean;
  onDone: () => void;
  onDismiss?: () => void;
};

export function CompleteRequirementsSheet({
  visible,
  taskId,
  task,
  hasArrived,
  onDone,
  onDismiss,
}: CompleteRequirementsSheetProps) {
  const { getCurrentPosition } = useGeolocation();
  const { stopTracking } = useActiveTracking();
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const companyId = getActiveCompanyId() ?? task?.companyId ?? 0;
  const requirements = useMemo(() => resolveCompletionRequirements(task), [task]);
  const validation = useMemo(
    () =>
      validateCompletionRequirements({
        photosCount: photos.length,
        notes: note,
        requirements,
      }),
    [photos.length, note, requirements],
  );

  useEffect(() => {
    if (!visible) {
      setNote('');
      setPhotos([]);
      setPreviews((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      setSubmitAttempted(false);
      setIsSubmitting(false);
    }
  }, [visible]);

  const handlePickPhoto = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPhotos((prev) => [...prev, ...files]);
    setPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
    e.target.value = '';
  };

  const removePhotoAt = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed);
      return next;
    });
  };

  const handleTaskDone = async () => {
    if (isSubmitting) return;
    setSubmitAttempted(true);

    if (!hasArrived) {
      toast.error('Not arrived yet', 'You must reach the destination before completing this task.');
      return;
    }

    const check = validateCompletionRequirements({
      photosCount: photos.length,
      notes: note,
      requirements,
    });
    if (!check.ok) {
      toast.error('Requirements incomplete', check.photoError ?? check.notesError ?? 'Complete all requirements.');
      return;
    }

    setIsSubmitting(true);
    try {
      try {
        const db = await getDb();
        for (const file of photos) {
          await db.add('proofQueue', {
            taskId,
            fileBlob: file,
            fileName: `proof_${taskId}_${Date.now()}.jpg`,
            mimeType: file.type || 'image/jpeg',
            uploaded: 0,
            createdAt: new Date().toISOString(),
            attempts: 0,
            nextAttemptAt: new Date().toISOString(),
            lastError: null,
          });
        }
      } catch (dbErr) {
        console.warn('[complete] proofQueue insert failed (non-fatal):', dbErr);
      }
      await syncEngine.scheduleSync();

      let position = {
        latitude: task?.latitude ?? 0,
        longitude: task?.longitude ?? 0,
        accuracyMeters: null as number | null,
        recordedAt: new Date().toISOString(),
      };
      try {
        const pos = await getCurrentPosition();
        position = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy,
          recordedAt: new Date(pos.timestamp).toISOString(),
        };
      } catch {
        // best-effort GPS; visit verification uses attached coords when available
      }

      const formData = buildCompleteFormData({
        companyId,
        files: photos,
        notes: note.trim() || undefined,
        position,
      });

      await taskApi.completeTask(taskId, formData);
      await stopTracking();

      toast.success('Task completed', 'Great work — tracking has stopped.');
      onDone();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not complete task. Please try again.';
      toast.error('Completion failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-[#051014]/60 backdrop-blur-sm z-[100] flex items-end sm:items-center justify-center p-0 sm:p-5 font-sans">
      <div className="relative bg-[#0B3343] border border-white/10 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-xl text-white">Complete task</h3>
            <p className="text-[11px] text-white/50 mt-1">
              Finish the required proofs before ending this visit.
            </p>
          </div>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:text-white"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {requirements.requiredActions.length > 0 && (
          <div className="rounded-xl border border-[#75ADAF]/30 bg-[#75ADAF]/10 p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#75ADAF]">
              Required actions
            </p>
            <ul className="space-y-1.5">
              {requirements.requiredActions.map((action) => (
                <li key={action} className="flex items-start gap-2 text-xs text-white/85">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#75ADAF]" />
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {requirements.visitVerificationRequired && (
          <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-400/20 rounded-xl px-3 py-2">
            Visit verification is required — your current location will be attached with the proofs.
          </p>
        )}

        <div className="bg-white rounded-xl p-3.5 min-h-[100px] flex flex-col">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
            Completion note{requirements.notesRequired ? ' *' : ''}
          </label>
          <textarea
            placeholder={
              requirements.notesRequired
                ? 'Describe how you completed the required actions…'
                : 'Optional note for your team…'
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full bg-transparent border-none text-[#09232D] placeholder-gray-400 focus:outline-none resize-none text-sm font-semibold p-0"
          />
          {submitAttempted && validation.notesError && (
            <p className="text-[11px] text-rose-500 mt-1">{validation.notesError}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#75ADAF]">
              Proof photos * (min {requirements.minPhotos})
            </p>
            <p className="text-[11px] text-white/50">
              {photos.length}/{requirements.minPhotos}
            </p>
          </div>

          {previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {previews.map((url, index) => (
                <div key={url} className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-white/15">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhotoAt(index)}
                    className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/70 text-white text-[10px]"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {submitAttempted && validation.photoError && (
            <p className="text-[11px] text-rose-300">{validation.photoError}</p>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex gap-3 mt-1">
          <button
            type="button"
            onClick={handlePickPhoto}
            disabled={isSubmitting}
            className="flex-1 h-12 rounded-xl border border-white/80 bg-transparent text-white font-bold text-xs hover:bg-white/5 active:scale-95 transition-all inline-flex items-center justify-center gap-1.5"
          >
            <Camera size={14} />
            Add photo
          </button>
          <button
            type="button"
            onClick={() => void handleTaskDone()}
            disabled={isSubmitting || !hasArrived}
            className="flex-1 h-12 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-xs active:scale-95 transition-all flex items-center justify-center disabled:opacity-40"
          >
            {isSubmitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              'Task Done'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
