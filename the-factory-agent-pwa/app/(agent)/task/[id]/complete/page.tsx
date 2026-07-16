'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Camera, CheckCircle2, ShieldAlert } from 'lucide-react';

import {
  useTask,
  useTaskNavigation,
  useCompleteTask,
} from '@/features/tasks';
import {
  useGeolocation,
  useActiveTracking,
  buildCompleteFormData,
  useTrackingNavigation,
  resolveCompletionRequirements,
  validateCompletionRequirements,
} from '@/features/tracking';
import { useTrackingStore } from '@/store/tracking';
import { getDb } from '@/lib/db/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { syncEngine } from '@/lib/sync/syncEngine';
import { toast } from '@/lib/toast';

export default function TaskCompletePage() {
  const routeParams = useParams();
  const id = (routeParams?.id as string) || '';
  const taskId = Number(id);

  const { data: task, isLoading } = useTask(id);
  const { goToTaskList } = useTaskNavigation();
  const { goToMapActivity } = useTrackingNavigation();
  const { mutate: completeTask, isPending, isError, error } = useCompleteTask();
  const { getCurrentPosition, ensureLocationPermission } = useGeolocation();
  const { stopTracking } = useActiveTracking();

  const [locationPermissionBlocked, setLocationPermissionBlocked] = useState(false);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const liveTask = useTrackingStore((s) => s.liveTaskMap[taskId]);
  const hasArrived =
    liveTask?.status === 'arrived' ||
    liveTask?.status === 'completed' ||
    liveTask?.arrivedAt != null;

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setPhotos((prev) => [...prev, ...files]);
    setPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
    e.target.value = '';
  };

  const triggerPicker = () => {
    fileInputRef.current?.click();
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

  const handleComplete = async () => {
    setSubmitAttempted(true);
    if (!task) return;

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

    const taskIdNum = Number(task.id);

    try {
      const db = await getDb();
      for (const file of photos) {
        await db.add('proofQueue', {
          taskId: taskIdNum,
          fileBlob: file,
          fileName: `proof_${task.id}_${Date.now()}.jpg`,
          mimeType: file.type || 'image/jpeg',
          uploaded: 0,
          createdAt: new Date().toISOString(),
          attempts: 0,
          nextAttemptAt: new Date().toISOString(),
          lastError: null,
        });
      }
    } catch (dbErr) {
      console.warn('[complete] proof_queue insert failed (non-fatal):', dbErr);
    }
    await syncEngine.scheduleSync();

    let position = {
      latitude: task.latitude,
      longitude: task.longitude,
      accuracyMeters: null as number | null,
      recordedAt: new Date().toISOString(),
    };

    try {
      const perm = await ensureLocationPermission();
      if (perm === 'denied') {
        setLocationPermissionBlocked(true);
        return;
      }
      setLocationPermissionBlocked(false);

      const pos = await getCurrentPosition();
      position = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracyMeters: pos.coords.accuracy,
        recordedAt: new Date(pos.timestamp).toISOString(),
      };
    } catch {
      // Use task destination as fallback
    }

    const formData = buildCompleteFormData({
      companyId,
      files: photos,
      notes: note.trim() || undefined,
      position,
    });

    completeTask(
      { taskId: taskIdNum, formData },
      {
        onSuccess: async () => {
          await stopTracking();
          goToTaskList();
        },
        onError: (err: unknown) => {
          const apiErr = err as { message?: string };
          toast.error('Completion failed', apiErr?.message ?? 'Please try again.');
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  const canSubmit = hasArrived && !isPending;

  return (
    <div className="flex flex-col flex-1 bg-[#0A1D25] min-h-screen">
      <header className="px-6 pt-[calc(env(safe-area-inset-top,0px)+16px)] pb-4 mt-2">
        <h2 className="font-sans font-semibold text-xl text-white">Complete Task</h2>
        {task && (
          <p className="font-sans text-xs text-[#8F9098] mt-1 leading-relaxed">{task.title}</p>
        )}
      </header>

      <div className="flex-1 px-6 pb-8 overflow-y-auto space-y-5">
        {!hasArrived && (
          <div className="bg-[#F5A623]/10 border-l-[3px] border-[#F5A623] rounded-xl p-3.5">
            <p className="font-sans text-xs text-white leading-relaxed mb-3">
              You must arrive at the destination before submitting proof of completion.
            </p>
            <button
              onClick={() => goToMapActivity(taskId)}
              className="text-xs font-semibold text-[#75ADAF] hover:text-white transition-colors"
            >
              Continue Tracking →
            </button>
          </div>
        )}

        {locationPermissionBlocked && (
          <div className="bg-[#FD6046]/10 border-l-[3px] border-[#FD6046] rounded-xl p-3.5">
            <p className="font-sans text-xs text-white leading-relaxed">
              Location access is required to record your completion position. Enable location in your
              device settings, then try again.
            </p>
          </div>
        )}

        {requirements.requiredActions.length > 0 && (
          <div className="rounded-xl border border-[#75ADAF]/30 bg-[#75ADAF]/10 p-3.5 space-y-2">
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

        <div>
          <h4 className="text-xs font-bold text-[#75ADAF] mb-1 uppercase tracking-wider font-sans">
            Completion note{requirements.notesRequired ? ' *' : ''}
          </h4>
          <textarea
            placeholder={
              requirements.notesRequired
                ? 'Describe how you completed the required actions…'
                : 'Optional note for your team…'
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full rounded-2xl border border-white/12 bg-[#0B3343]/50 px-4 py-3 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-[#75ADAF]"
          />
          {submitAttempted && validation.notesError && (
            <p className="text-[#FD6046] text-[11px] mt-2 font-sans font-medium">
              {validation.notesError}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-xs font-bold text-[#75ADAF] uppercase tracking-wider font-sans">
              Proof photos * (min {requirements.minPhotos})
            </h4>
            <span className="text-[11px] text-[#8F9098]">
              {photos.length}/{requirements.minPhotos}
            </span>
          </div>
          <p className="text-xs text-[#8F9098] leading-relaxed mb-4 font-sans">
            Take photos at the task location as proof of visit.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {previews.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-3">
              {previews.map((url, index) => (
                <div
                  key={url}
                  className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden border border-white/15"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhotoAt(index)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/70 text-white text-[10px]"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={triggerPicker}
            className="w-full min-h-[120px] rounded-2xl border border-dashed border-white/12 bg-[#0B3343]/50 flex flex-col items-center justify-center gap-2.5 hover:bg-[#0B3343]/70 transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-[#75ADAF]/15 flex items-center justify-center border border-[#75ADAF]/30 text-[#75ADAF]">
              <Camera size={24} />
            </div>
            <span className="font-sans font-semibold text-sm text-[#75ADAF]">
              {photos.length > 0 ? 'Add another photo' : 'Take photo'}
            </span>
          </button>

          {submitAttempted && validation.photoError && (
            <p className="text-[#FD6046] text-[11px] mt-2 font-sans font-medium">
              {validation.photoError}
            </p>
          )}
        </div>

        {isError && error && (
          <div className="bg-[#FD6046]/10 border-l-[3px] border-[#FD6046] rounded-xl p-3.5 flex items-start gap-2.5">
            <ShieldAlert size={18} className="text-[#FD6046] flex-shrink-0 mt-0.5" />
            <span className="font-sans text-xs text-white">
              {(error as Error).message || 'Submission failed. Please try again.'}
            </span>
          </div>
        )}

        <button
          onClick={() => void handleComplete()}
          disabled={!canSubmit}
          className={`w-full h-[51px] rounded-[30px] bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-sm transition-all duration-200 shadow-md flex items-center justify-center ${
            !canSubmit ? 'opacity-35 cursor-not-allowed' : 'active:scale-95'
          }`}
        >
          {isPending ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            'Mark as Complete'
          )}
        </button>
      </div>
    </div>
  );
}
