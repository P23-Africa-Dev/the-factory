export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#0A1D25] px-6 py-10 text-white">
      <h1 className="text-xl font-semibold">Offline Mode Active</h1>
      <p className="mt-3 max-w-2xl text-sm text-white/80">
        You can continue working. Approved actions are queued locally and synchronize
        automatically when connectivity returns.
      </p>
    </div>
  );
}

