export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-[#0A1D25] text-white px-6 py-10">
      <h1 className="text-xl font-semibold">Offline Mode Active</h1>
      <p className="mt-3 text-sm text-white/80">
        You can continue working. New actions, uploads, and tracking points are stored locally
        and synchronized automatically when connectivity returns.
      </p>
    </div>
  );
}

