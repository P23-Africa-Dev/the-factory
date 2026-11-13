'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Eye, Search, X } from 'lucide-react';

export type ObserverPerson = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

export function observerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * The backend falls back to a generic ghost image under avatar/default/ when a user
 * has no avatar. Initials identify the person better than that image.
 */
function isRealAvatar(url?: string | null): url is string {
  return Boolean(url) && !/\/avatar\/default\//i.test(url as string);
}

export function ObserverAvatar({
  person,
  size = 22,
  ringClassName = 'ring-2 ring-[#0B1E26]',
}: {
  person: ObserverPerson;
  size?: number;
  ringClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) };

  if (isRealAvatar(person.avatarUrl) && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatarUrl}
        alt={person.name}
        title={person.name}
        style={style}
        onError={() => setImageFailed(true)}
        className={`rounded-full object-cover bg-white/10 shrink-0 ${ringClassName}`}
      />
    );
  }

  return (
    <span
      title={person.name}
      aria-label={person.name}
      style={style}
      className={`rounded-full bg-[#75ADAF]/25 text-[#BFE3E4] font-bold flex items-center justify-center shrink-0 ${ringClassName}`}
    >
      {observerInitials(person.name)}
    </span>
  );
}

/** Overlapping observer avatars with a "+N" overflow, for task cards. */
export function ObserverAvatars({
  observers,
  max = 3,
  size = 22,
  showIcon = true,
}: {
  observers: ObserverPerson[];
  max?: number;
  size?: number;
  showIcon?: boolean;
}) {
  if (observers.length === 0) return null;

  const shown = observers.slice(0, max);
  const extra = observers.length - shown.length;
  const names = observers.map((o) => o.name).join(', ');

  return (
    <div className="flex items-center gap-1.5" aria-label={`Observers: ${names}`} title={`Observers: ${names}`}>
      {showIcon && <Eye size={12} className="text-white/40 shrink-0" aria-hidden="true" />}
      <div className="flex items-center -space-x-1.5">
        {shown.map((person) => (
          <ObserverAvatar key={person.id} person={person} size={size} />
        ))}
        {extra > 0 && (
          <span
            style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) }}
            className="rounded-full ring-2 ring-[#0B1E26] bg-white/10 text-white/70 font-bold flex items-center justify-center shrink-0"
          >
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}

/** Small badge telling the viewer they follow, rather than perform, this task. */
export function ObservingBadge({ label = 'Observing' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#75ADAF]/15 border border-[#75ADAF]/30 px-2 py-0.5 text-[10px] font-bold text-[#BFE3E4]">
      <Eye size={10} aria-hidden="true" />
      {label}
    </span>
  );
}

/** A labelled list of everyone a task is assigned to, for task detail screens. */
export function AssigneeList({ assignees }: { assignees: ObserverPerson[] }) {
  if (assignees.length === 0) return null;

  return (
    <div className="bg-[#1F2E35] border border-white/10 rounded-xl p-4">
      <h4 className="text-xs font-bold text-[#75ADAF] mb-2 uppercase tracking-wider">
        Assigned to
      </h4>
      <ul className="flex flex-wrap gap-2">
        {assignees.map((person) => (
          <li
            key={person.id}
            className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 py-1 pl-1 pr-3 text-sm text-[#D0D0D0]"
          >
            <ObserverAvatar person={person} size={22} ringClassName="" />
            {person.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A labelled list of observers for task detail screens. */
export function ObserverList({ observers, isObserver }: { observers: ObserverPerson[]; isObserver?: boolean }) {
  return (
    <div className="bg-[#1F2E35] border border-white/10 rounded-xl p-4">
      <h4 className="text-xs font-bold text-[#75ADAF] mb-2 uppercase tracking-wider">Observers</h4>
      {observers.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {observers.map((observer) => (
            <li
              key={observer.id}
              className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 py-1 pl-1 pr-3 text-sm text-[#D0D0D0]"
            >
              <ObserverAvatar person={observer} size={22} ringClassName="" />
              {observer.name}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[#8F9098] italic">No observers</p>
      )}
      {isObserver && (
        <p className="mt-3 rounded-lg bg-[#75ADAF]/10 px-3 py-2 text-xs text-[#BFE3E4]">
          You&apos;re observing this task. You can follow its progress and comment, but it isn&apos;t assigned to you.
        </p>
      )}
    </div>
  );
}

/**
 * Multi-select of people, used for task observers and assignees: removable chips
 * plus an inline searchable checklist.
 */
export function ObserverPicker({
  people,
  value,
  onChange,
  excludeIds = [],
  loading = false,
  ariaLabel = 'Select observers',
  placeholder = 'Add people to observe this task',
  icon,
}: {
  people: ObserverPerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Ids that cannot be picked, such as the task's assignee when choosing observers. */
  excludeIds?: string[];
  loading?: boolean;
  /** Accessible name of the toggle button. */
  ariaLabel?: string;
  /** Text shown when nobody is selected. */
  placeholder?: string;
  /** Icon at the start of the field. Defaults to an eye, for observers. */
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const available = useMemo(
    () => people.filter((person) => !excludeIds.includes(person.id)),
    [people, excludeIds],
  );
  const selected = useMemo(() => available.filter((person) => value.includes(person.id)), [available, value]);
  const query = search.trim().toLowerCase();
  const filtered = query ? available.filter((person) => person.name.toLowerCase().includes(query)) : available;

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 focus-within:border-[#75ADAF]/60 transition-colors">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className="w-full flex items-center gap-2 px-3 py-2 min-h-[42px] text-left"
      >
        {icon ?? <Eye size={13} className="text-white/40 shrink-0" aria-hidden="true" />}
        {selected.length === 0 ? (
          <span className="flex-1 text-sm text-white/40">{loading ? 'Loading…' : placeholder}</span>
        ) : (
          <span className="flex-1 flex flex-wrap gap-1.5">
            {selected.map((person) => (
              <span
                key={person.id}
                className="inline-flex items-center gap-1.5 bg-white/10 rounded-full pl-0.5 pr-2 py-0.5 text-xs text-white"
              >
                <ObserverAvatar person={person} size={18} ringClassName="" />
                {person.name}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${person.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(person.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      toggle(person.id);
                    }
                  }}
                  className="text-white/50 hover:text-white"
                >
                  <X size={11} />
                </span>
              </span>
            ))}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-white/40 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-white/10">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
            <Search size={13} className="text-white/40 shrink-0" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search people…"
              aria-label={`Search: ${ariaLabel}`}
              className="flex-1 text-sm text-white placeholder:text-white/30 outline-none bg-transparent"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-white/40">
                {loading ? 'Loading people…' : 'No people match your search.'}
              </li>
            ) : (
              filtered.map((person) => (
                <li key={person.id}>
                  <label className="flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={value.includes(person.id)}
                      onChange={() => toggle(person.id)}
                      aria-label={person.name}
                      className="accent-[#75ADAF] w-4 h-4"
                    />
                    <ObserverAvatar person={person} size={24} ringClassName="" />
                    <span className="text-sm text-white">{person.name}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
