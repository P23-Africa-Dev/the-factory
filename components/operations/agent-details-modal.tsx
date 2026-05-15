"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import PhoneNumberInput from "@/components/ui/phone-number-input";
import { listAvatars } from "@/lib/api/internal-onboarding";

const AVATAR_BATCH_SIZE = 8;

export interface AgentDetails {
  phone: string;
  gender: "male" | "female" | "";
  avatarKey: string;
}

interface AgentDetailsModalProps {
  isOpen: boolean;
  details: AgentDetails;
  onDetailsChange: (details: AgentDetails) => void;
  errors?: { phone?: string; gender?: string; avatarKey?: string };
  onClearError?: (field: "phone" | "gender" | "avatarKey") => void;
}

export function AgentDetailsModal({
  isOpen,
  details,
  onDetailsChange,
  errors = {},
  onClearError,
}: AgentDetailsModalProps) {
  // All hooks MUST be declared before any conditional return (Rules of Hooks).
  const normalizedGender = details.gender ? details.gender as "male" | "female" : null;

  const avatarQuery = useQuery({
    queryKey: ["internal-avatar-list", normalizedGender],
    queryFn: () => listAvatars(normalizedGender as "male" | "female"),
    enabled: Boolean(normalizedGender),
    staleTime: 60_000,
  });

  const avatarItems = useMemo(() => {
    return avatarQuery.data?.data ?? [];
  }, [avatarQuery.data]);

  const [failedImageKeys, setFailedImageKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFailedImageKeys(new Set());
  }, [normalizedGender]);

  const visibleAvatars = avatarItems.slice(0, AVATAR_BATCH_SIZE);

  if (!isOpen) return null;

  const set = <K extends keyof AgentDetails>(key: K, val: AgentDetails[K]) =>
    onDetailsChange({ ...details, [key]: val });

  return (
    <div className="fixed right-119.75 bottom-3.25 z-[60]">
      <div className="relative bg-white rounded-3xl w-full max-w-105 p-7 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026]">
        <h3 className="text-[20px] font-bold text-[#0B1215] mb-6">
          Agent Details
        </h3>

        <SectionDivider label="Personal Information" />

        <div className="space-y-4 mb-6">
          <div>
            <FormRow label="Phone Number">
              <div className="col-span-2">
                <PhoneNumberInput
                  variant="compact"
                  value={details.phone}
                  onChange={(value) => {
                    set("phone", value);
                    onClearError?.("phone");
                  }}
                  placeholder="E.g +234 9099999999"
                />
              </div>
            </FormRow>
            {errors.phone && <p className="text-[11px] text-red-500 mt-0.5 text-right">{errors.phone}</p>}
          </div>

          <div>
            <FormRow label="Gender">
              <InlineSelect
                value={details.gender}
                onChange={(e) => {
                  set("gender", e.target.value as "male" | "female" | "");
                  set("avatarKey", "");
                  onClearError?.("gender");
                  onClearError?.("avatarKey");
                }}
                className="col-span-2"
              >
                <option value="" disabled>
                  E.g Male
                </option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </InlineSelect>
            </FormRow>
            {errors.gender && <p className="text-[11px] text-red-500 mt-0.5 text-right">{errors.gender}</p>}
          </div>
        </div>

        <SectionDivider label="Profile Picture" />

        <div className="pt-2 mb-6">
          <p className="text-[11px] text-gray-500 mb-2">
            Select an avatar for this user
          </p>

          {!normalizedGender ? (
            <p className="text-[11px] text-gray-400">Choose gender to load avatars.</p>
          ) : avatarQuery.isPending ? (
            <p className="text-[11px] text-gray-400">Loading avatars...</p>
          ) : avatarQuery.isError ? (
            <p className="text-[11px] text-red-500">Unable to load avatars right now.</p>
          ) : visibleAvatars.length === 0 ? (
            <p className="text-[11px] text-gray-400">No avatars available for selected gender.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {visibleAvatars.map((avatar) => (
                <button
                  key={avatar.key}
                  type="button"
                  onClick={() => {
                    set("avatarKey", avatar.key);
                    onClearError?.("avatarKey");
                  }}
                  className={`h-14 w-14 rounded-full overflow-hidden border-2 transition-all ${
                    details.avatarKey === avatar.key
                      ? "border-[#094B5C] ring-2 ring-offset-1 ring-[#094B5C]/30"
                      : "border-gray-200"
                  }`}
                  title={avatar.key}
                >
                  {Boolean(avatar.url) && !failedImageKeys.has(avatar.key) ? (
                    <img
                      src={avatar.url ?? ""}
                      alt={avatar.key}
                      className="block h-full w-full object-cover"
                      onError={() =>
                        setFailedImageKeys((prev) => {
                          const next = new Set(prev);
                          next.add(avatar.key);
                          return next;
                        })
                      }
                    />
                  ) : avatar.svg ? (
                    <div
                      className="h-full w-full [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: avatar.svg }}
                    />
                  ) : (
                    <div className="h-full w-full bg-gray-100" />
                  )}
                </button>
              ))}
            </div>
          )}

          {errors.avatarKey && (
            <p className="text-[11px] text-red-500 mt-2 text-right">{errors.avatarKey}</p>
          )}
        </div>

        <div className="flex items-center justify-start">
          <button
            type="submit"
            form="add-agent-form"
            className="w-fit px-9.25 py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
