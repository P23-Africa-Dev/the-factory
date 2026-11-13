"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Eye, Search, X } from "lucide-react";
import { ObserverAvatar, type ObserverPerson } from "@/components/operations/observer-avatars";

type ObserverPickerProps = {
  /** Everyone who can be picked. */
  people: ObserverPerson[];
  /** Selected user ids, as strings. */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Ids that cannot be observers, such as the task's assignee. */
  excludeIds?: string[];
  loading?: boolean;
  /** Accessible name of the toggle button. */
  ariaLabel?: string;
  /** Text shown when nobody is selected. */
  placeholder?: string;
  /** Icon at the start of the field. Defaults to an eye, for observers. */
  icon?: ReactNode;
  invalid?: boolean;
};

/**
 * Multi-select of people, used for task observers and assignees. Selected people
 * show as removable chips; the list expands inline with a search box and a
 * checkbox per person.
 */
export function ObserverPicker({
  people,
  value,
  onChange,
  excludeIds = [],
  loading = false,
  ariaLabel = "Select observers",
  placeholder = "Add people to observe this task",
  icon,
  invalid = false,
}: ObserverPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const available = useMemo(
    () => people.filter((person) => !excludeIds.includes(String(person.id))),
    [people, excludeIds],
  );
  const selected = useMemo(
    () => available.filter((person) => value.includes(String(person.id))),
    [available, value],
  );
  const query = search.trim().toLowerCase();
  const filtered = query
    ? available.filter((person) => person.name.toLowerCase().includes(query))
    : available;

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div
      className={`rounded-xl border-2 bg-gray-50 focus-within:border-[#094B5C] transition-colors ${
        invalid ? "border-red-300" : "border-gray-200"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className="w-full flex items-center gap-2 px-3 py-2 min-h-[42px] text-left cursor-pointer"
      >
        {icon ?? <Eye size={13} className="text-gray-400 shrink-0" aria-hidden="true" />}
        {selected.length === 0 ? (
          <span className="flex-1 text-[13px] text-gray-400">
            {loading ? "Loading…" : placeholder}
          </span>
        ) : (
          <span className="flex-1 flex flex-wrap gap-1.5">
            {selected.map((person) => (
              <span
                key={person.id}
                className="inline-flex items-center gap-1.5 bg-white border border-gray-200 rounded-full pl-0.5 pr-2 py-0.5 text-[12px] text-dash-dark"
              >
                <ObserverAvatar person={person} size={18} className="ring-0" />
                {person.name}
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${person.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(String(person.id));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      toggle(String(person.id));
                    }
                  }}
                  className="text-gray-400 hover:text-gray-700 cursor-pointer"
                >
                  <X size={11} />
                </span>
              </span>
            ))}
          </span>
        )}
        <ChevronDown
          size={14}
          className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-gray-200 bg-white rounded-b-xl">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <Search size={13} className="text-gray-400 shrink-0" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search people…"
              aria-label={`Search: ${ariaLabel}`}
              className="flex-1 text-[12px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-[12px] text-gray-400">
                {loading ? "Loading people…" : "No people match your search."}
              </li>
            ) : (
              filtered.map((person) => {
                const id = String(person.id);
                const checked = value.includes(id);
                return (
                  <li key={person.id}>
                    <label className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(id)}
                        aria-label={person.name}
                        className="accent-[#094B5C] w-3.5 h-3.5 cursor-pointer"
                      />
                      <ObserverAvatar person={person} size={22} className="ring-0" />
                      <span className="text-[13px] text-gray-700">{person.name}</span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
