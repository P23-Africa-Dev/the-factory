export function FormRow({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <label className="text-[12px] text-gray-400 font-medium shrink-0">
        {label}
      </label>
      <div className="flex-1 min-w-0 flex justify-end">{children}</div>
    </div>
  );
}
