import { Suspense } from 'react';
import { MobileInstallContent } from './MobileInstallContent';

function InstallLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A1D25]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
    </div>
  );
}

export default function MobileInstallPage() {
  return (
    <Suspense fallback={<InstallLoading />}>
      <MobileInstallContent />
    </Suspense>
  );
}
