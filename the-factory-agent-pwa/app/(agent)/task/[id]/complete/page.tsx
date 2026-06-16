'use client';

import React, { useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Camera, ShieldAlert } from 'lucide-react';

import { useTask, useTaskNavigation, useCompleteTask } from '@/features/tasks';
import { getDb } from '@/lib/db/client';
import { getActiveCompanyId } from '@/lib/storage/stores';

export default function TaskCompletePage() {
  const router = useRouter();
  const routeParams = useParams();
  const id = (routeParams?.id as string) || '';
  const taskId = Number(id);

  const { data: task, isLoading } = useTask(id);
  const { goToTaskList } = useTaskNavigation();
  const { mutate: completeTask, isPending, isError, error } = useCompleteTask();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const companyId = getActiveCompanyId() ?? 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUri(objectUrl);
    }
  };

  const triggerPicker = () => {
    fileInputRef.current?.click();
  };

  const handleComplete = async () => {
    setSubmitAttempted(true);
    if (!task || !selectedFile) return;

    const taskIdNum = Number(task.id);

    // Write to IndexedDB proof queue for background sync safety
    try {
      const db = await getDb();
      await db.add('proofQueue', {
        taskId: taskIdNum,
        fileBlob: selectedFile,
        fileName: `proof_${task.id}_${Date.now()}.jpg`,
        mimeType: selectedFile.type || 'image/jpeg',
        uploaded: 0,
        createdAt: new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn('[complete] proof_queue insert failed (non-fatal):', dbErr);
    }

    const formData = new FormData();
    formData.append('company_id', String(companyId));
    formData.append('notes', '');
    formData.append('file', selectedFile);

    completeTask(
      { taskId: taskIdNum, formData },
      {
        onSuccess: () => {
          goToTaskList();
        },
        onError: (err: unknown) => {
          console.error('[complete] API error:', err);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  const photoMissing = submitAttempted && !selectedFile;
  const canSubmit = Boolean(selectedFile) && !isPending;

  return (
    <div className="flex flex-col flex-1 bg-[#0A1D25] min-h-screen">
      <header className="px-6 py-4 mt-2">
        <h2 className="font-sans font-semibold text-xl text-white">
          Complete Task
        </h2>
        {task && (
          <p className="font-sans text-xs text-[#8F9098] mt-1 leading-relaxed">
            {task.title}
          </p>
        )}
      </header>

      <div className="flex-1 px-6 pb-8 overflow-y-auto">
        <div className="mb-7">
          <h4 className="text-xs font-bold text-[#75ADAF] mb-1 uppercase tracking-wider font-sans">
            Proof Photo <span className="text-[#FD6046]">*</span>
          </h4>
          <p className="text-xs text-[#8F9098] leading-relaxed mb-4 font-sans">
            Take a photo at the task location as proof of visit.
          </p>

          {/* Hidden HTML input file */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment" // Request mobile camera directly when opened on phone
            onChange={handleFileChange}
            className="hidden"
          />

          <div
            onClick={triggerPicker}
            className={`w-full min-h-[180px] rounded-2xl border-1.5 border-dashed border-white/12 bg-[#0B3343]/50 flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-colors hover:bg-[#0B3343]/70 ${
              previewUri ? 'border-solid border-[#75ADAF]' : ''
            }`}
          >
            {previewUri ? (
              <div className="relative w-full h-[240px]">
                <img
                  src={previewUri}
                  alt="Proof preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-black/55 py-2.5 text-center">
                  <span className="font-sans font-semibold text-xs text-white">
                    Tap to retake
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5 p-8">
                <div className="w-14 h-14 rounded-full bg-[#75ADAF]/15 flex items-center justify-center border border-[#75ADAF]/30 text-[#75ADAF]">
                  <Camera size={24} />
                </div>
                <span className="font-sans font-semibold text-sm text-[#75ADAF]">
                  Take Photo
                </span>
              </div>
            )}
          </div>

          {photoMissing && (
            <p className="text-[#FD6046] text-[11px] mt-2 font-sans font-medium">
              A proof photo is required to complete this task.
            </p>
          )}
        </div>

        {/* API Error banner */}
        {isError && error && (
          <div className="bg-[#FD6046]/10 border-l-[3px] border-[#FD6046] rounded-xl p-3.5 mb-5 flex items-start gap-2.5">
            <ShieldAlert size={18} className="text-[#FD6046] flex-shrink-0 mt-0.5" />
            <span className="font-sans text-xs text-white">
              {(error as Error).message || 'Submission failed. Please try again.'}
            </span>
          </div>
        )}

        <button
          onClick={handleComplete}
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

        {!previewUri && (
          <p className="text-center text-xs text-[#8F9098] mt-3 font-sans">
            Take a proof photo to enable submission.
          </p>
        )}
      </div>
    </div>
  );
}
