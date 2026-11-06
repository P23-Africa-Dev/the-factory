export type CompletionPosition = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  recordedAt?: string;
};

export type BuildCompleteFormDataInput = {
  companyId: number;
  files: File[];
  notes?: string;
  position: CompletionPosition;
};

/** Builds multipart body for POST /agent/tasks/{id}/complete */
export function buildCompleteFormData({
  companyId,
  files,
  notes,
  position,
}: BuildCompleteFormDataInput): FormData {
  const formData = new FormData();
  formData.append('company_id', String(companyId));
  formData.append('latitude', String(position.latitude));
  formData.append('longitude', String(position.longitude));
  if (position.accuracyMeters != null) {
    formData.append('accuracy_meters', String(position.accuracyMeters));
  }
  formData.append(
    'recorded_at',
    position.recordedAt ?? new Date().toISOString(),
  );
  if (notes?.trim()) {
    formData.append('notes', notes.trim());
  }
  for (const file of files) {
    formData.append('files[]', file);
  }
  return formData;
}
