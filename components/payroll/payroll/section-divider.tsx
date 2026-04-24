export function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-[12px] text-gray-400 font-medium whitespace-nowrap">
        {label}
      </span>
      <div className="flex-6 h-px bg-gray-200" />
    </div>
  );
}
