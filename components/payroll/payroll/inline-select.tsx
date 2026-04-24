type InlineSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function InlineSelect({
  className = "",
  children,
  ...props
}: InlineSelectProps) {
  return (
    <div className="relative w-full">
      <select
        className={`appearance-none h-12.25 w-full pl-4 pr-8 rounded-xl border border-gray-200 text-[10px] font-light text-[#616263] bg-white outline-none focus:border-gray-400 transition-colors shadow-[0px_1px_3px_1px_#00000026,0px_1px_2px_0px_#0000004D] cursor-pointer ${className}`}
        {...props}
      >
        {children}
      </select>
      <svg
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
