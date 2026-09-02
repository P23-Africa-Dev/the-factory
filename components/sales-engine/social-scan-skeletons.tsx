function Shimmer({ className }: { className?: string }) {
  return (
    <span
      className={`block animate-pulse rounded-md bg-[#09232d]/8 ${className ?? ""}`}
    />
  );
}

export function SocialSignalRowSkeleton({ index = 0 }: { index?: number }) {
  const opacity = 1 - index * 0.08;

  return (
    <tr
      className="bg-[#f4f4f4]/80 text-[#616263]"
      style={{ opacity: Math.max(opacity, 0.45) }}
    >
      <td className="rounded-l-[20px] px-4 py-3">
        <div className="flex min-w-[230px] gap-3">
          <Shimmer className="size-[22px] shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-2 w-full" />
            <Shimmer className="h-2 w-[85%]" />
            <Shimmer className="h-2 w-[60%]" />
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <Shimmer className="h-2 w-[48px]" />
        <Shimmer className="mt-2 h-2 w-[36px]" />
      </td>
      <td className="px-3 py-3 align-middle">
        <Shimmer className="h-2 w-[56px]" />
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex min-w-[150px] items-center gap-2">
          <Shimmer className="size-5 shrink-0 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Shimmer className="h-2 w-[80px]" />
            <Shimmer className="h-2 w-[56px]" />
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <Shimmer className="h-5 w-[72px] rounded-full" />
        <Shimmer className="mt-2 h-2 w-[64px]" />
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="mx-auto grid size-[43px] place-items-center">
          <Shimmer className="size-[43px] rounded-full" />
        </div>
      </td>
      <td className="rounded-r-[20px] px-4 py-3 align-middle">
        <div className="flex items-center justify-center gap-4">
          <Shimmer className="size-[15px] rounded-full" />
          <Shimmer className="size-4 rounded-full" />
        </div>
      </td>
    </tr>
  );
}

export function SocialSignalsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <SocialSignalRowSkeleton key={index} index={index} />
      ))}
    </>
  );
}

export function SocialOpportunityDetailSkeleton() {
  return (
    <aside className="flex min-h-[645px] flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)]">
      <div className="relative h-[165px] bg-[#0b242e] px-7 pb-5 pt-8">
        <Shimmer className="absolute right-7 top-8 size-[43px] rounded-full bg-white/10" />
        <Shimmer className="size-[22px] rounded-full bg-white/15" />
        <div className="mt-3 space-y-2">
          <Shimmer className="h-2 w-full bg-white/10" />
          <Shimmer className="h-2 w-[90%] bg-white/10" />
          <Shimmer className="h-2 w-[70%] bg-white/10" />
        </div>
        <Shimmer className="mt-3 h-2 w-[120px] bg-white/10" />
      </div>

      <div className="flex flex-1 flex-col gap-4 px-7 py-6">
        <div className="flex items-center gap-3">
          <Shimmer className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-2.5 w-[100px]" />
            <Shimmer className="h-2 w-[140px]" />
          </div>
        </div>

        <Shimmer className="h-6 w-[88px] rounded-full" />

        <div className="space-y-2">
          <Shimmer className="h-2 w-full" />
          <Shimmer className="h-2 w-[92%]" />
          <Shimmer className="h-2 w-[78%]" />
        </div>

        <div className="mt-auto space-y-3">
          <Shimmer className="h-10 w-full rounded-[14px]" />
          <Shimmer className="h-10 w-full rounded-[14px]" />
        </div>
      </div>

      <p className="border-t border-[#f1f1f1] px-7 py-4 text-center text-[10px] text-[#616263]">
        Results appear here as signals are scored — select one to preview details.
      </p>
    </aside>
  );
}
