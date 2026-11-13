"use client";

import { useState } from "react";
import { Eye } from "lucide-react";

export type ObserverPerson = {
  id: number | string;
  name: string;
  avatar_url?: string | null;
};

export function observerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
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
  className = "",
}: {
  person: ObserverPerson;
  size?: number;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) };

  if (isRealAvatar(person.avatar_url) && !imageFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={person.avatar_url}
        alt={person.name}
        title={person.name}
        style={style}
        onError={() => setImageFailed(true)}
        className={`rounded-full object-cover ring-2 ring-white bg-gray-100 shrink-0 ${className}`}
      />
    );
  }

  return (
    <span
      title={person.name}
      aria-label={person.name}
      style={style}
      className={`rounded-full ring-2 ring-white bg-[#E6F1F0] text-[#094B5C] font-bold flex items-center justify-center shrink-0 ${className}`}
    >
      {observerInitials(person.name)}
    </span>
  );
}

/**
 * Overlapping avatars of a task's observers, with a "+N" overflow and an eye icon
 * so the row reads as "observed by", not "assigned to".
 */
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
  const names = observers.map((o) => o.name).join(", ");

  return (
    <div className="flex items-center gap-1.5" aria-label={`Observers: ${names}`} title={`Observers: ${names}`}>
      {showIcon && <Eye size={12} className="text-gray-400 shrink-0" aria-hidden="true" />}
      <div className="flex items-center -space-x-1.5">
        {shown.map((person) => (
          <ObserverAvatar key={person.id} person={person} size={size} />
        ))}
        {extra > 0 && (
          <span
            style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.4)) }}
            className="rounded-full ring-2 ring-white bg-gray-100 text-gray-500 font-bold flex items-center justify-center shrink-0"
          >
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}
