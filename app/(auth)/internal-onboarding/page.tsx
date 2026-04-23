"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useInvitationPreview, useCompleteOnboarding } from "@/hooks/use-internal-onboarding";
import { setAuthSession } from "@/lib/auth/session";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import type { AvatarOption } from "@/lib/api/internal-users";

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[a-zA-Z]/, "Must contain at least one letter.")
      .regex(/[0-9]/, "Must contain at least one number."),
    password_confirmation: z.string().min(1, "Please confirm your password."),
    phone_number: z.string().optional(),
    gender: z.enum(["male", "female"]).optional(),
    avatar_key: z.string().optional(),
  })
  .refine((d) => d.password === d.password_confirmation, {
    message: "Passwords do not match.",
    path: ["password_confirmation"],
  });

type FormValues = z.infer<typeof schema>;

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="w-full max-w-md animate-pulse space-y-5">
      <div className="h-5 w-32 bg-gray-200 rounded-full" />
      <div className="h-8 w-64 bg-gray-200 rounded-full" />
      <div className="h-4 w-full bg-gray-100 rounded-full" />
      <div className="h-4 w-3/4 bg-gray-100 rounded-full" />
      <div className="space-y-3 mt-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[60px] bg-gray-100 rounded-full" />
        ))}
      </div>
      <div className="h-[51px] bg-gray-200 rounded-full mt-4" />
    </div>
  );
}

// ─── Avatar picker ────────────────────────────────────────────────────────────

function AvatarPicker({
  options,
  selected,
  onSelect,
}: {
  options: AvatarOption[];
  selected: string | undefined;
  onSelect: (key: string) => void;
}) {
  if (!options.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-[#7D7F82] px-1">Choose your avatar</p>
      <div className="grid grid-cols-4 gap-3">
        {options.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onSelect(opt.key)}
            className={`relative w-full aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
              selected === opt.key
                ? "border-[#6FA8A6] shadow-md scale-105"
                : "border-transparent hover:border-gray-200"
            }`}
          >
            {opt.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={opt.url}
                alt={opt.key}
                className="w-full h-full object-cover"
              />
            ) : opt.svg ? (
              <span
                className="w-full h-full flex items-center justify-center"
                dangerouslySetInnerHTML={{ __html: opt.svg }}
              />
            ) : (
              <span className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                ?
              </span>
            )}
            {selected === opt.key && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-[#6FA8A6] rounded-full flex items-center justify-center">
                <svg width="8" height="7" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function InternalOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawId = searchParams.get("invitation_id");
  const token = searchParams.get("token");
  const invitationId = rawId ? parseInt(rawId, 10) : null;

  const { data: preview, isLoading, error } = useInvitationPreview(invitationId, token);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      phone_number: "",
      gender: undefined,
      avatar_key: undefined,
    },
  });

  const selectedGender = watch("gender");
  const selectedAvatarKey = watch("avatar_key");

  useEffect(() => {
    if (preview?.data.prefilled_data) {
      const { phone_number, gender, avatar_key } = preview.data.prefilled_data;
      if (phone_number) setValue("phone_number", phone_number);
      if (gender) setValue("gender", gender);
      if (avatar_key) setValue("avatar_key", avatar_key);
    }
  }, [preview, setValue]);

  const { mutate, isPending } = useCompleteOnboarding({
    onSuccess: (data) => {
      setAuthSession(data.token, true);
      toast.success("Account activated! Please log in to continue.");
      router.push("/login");
    },
    onError: (message) => {
      toast.error(message);
    },
  });

  function onSubmit(values: FormValues) {
    if (!invitationId || !token) return;
    mutate({
      invitation_id: invitationId,
      token,
      password: values.password,
      password_confirmation: values.password_confirmation,
      phone_number: values.phone_number || undefined,
      gender: values.gender,
      avatar_key: values.avatar_key,
    });
  }

  // ── Invalid / missing params ─────────────────────────────
  if (!invitationId || !token) {
    return (
      <div className="w-full max-w-md text-center flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold text-[#34373C]">Invalid link</h2>
        <p className="text-sm text-[#7D7F82]">
          This invitation link is missing required parameters. Please use the link from your email.
        </p>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────
  if (isLoading) return <PageSkeleton />;

  // ── Error (expired / invalid token) ─────────────────────
  if (error || !preview) {
    return (
      <div className="w-full max-w-md text-center flex flex-col gap-4">
        <h2 className="text-2xl font-extrabold text-[#34373C]">Link expired or invalid</h2>
        <p className="text-sm text-[#7D7F82]">
          {error instanceof Error
            ? error.message
            : "This invitation link is no longer valid. Ask your manager to resend the invite."}
        </p>
      </div>
    );
  }

  const { user, prefilled_data, avatar_options } = preview.data;
  const avatarsForGender = selectedGender
    ? avatar_options.filter((a) => a.key.startsWith(selectedGender))
    : avatar_options;

  return (
    <div className="w-full max-w-md flex flex-col gap-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[2px] text-[#6FA8A6]">
          You&apos;re invited
        </p>
        <h2 className="text-[28px] font-extrabold text-[#34373C] leading-tight">
          Set up your account
        </h2>
        <p className="text-sm text-[#7D7F82] leading-relaxed">
          Welcome, <span className="font-semibold text-[#34373C]">{user.name}</span>. Complete your profile and set a password to activate your account.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* ── Phone number ── */}
        <div>
          <Input
            type="tel"
            placeholder="Phone number (e.g. +2348012345678)"
            {...register("phone_number")}
          />
          {errors.phone_number && (
            <p className="mt-1.5 px-4 text-xs text-red-500">{errors.phone_number.message}</p>
          )}
        </div>

        {/* ── Gender ── */}
        <div className="flex gap-3">
          {(["male", "female"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setValue("gender", g);
                if (selectedAvatarKey && !selectedAvatarKey.startsWith(g)) {
                  setValue("avatar_key", undefined);
                }
              }}
              className={`flex-1 h-[52px] rounded-full border text-xs font-semibold capitalize transition-all ${
                selectedGender === g
                  ? "border-[#6FA8A6] bg-[#6FA8A6]/10 text-[#6FA8A6]"
                  : "border-gray-200 text-[#A9AAAB] hover:border-gray-300"
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* ── Avatar picker ── */}
        {avatarsForGender.length > 0 && (
          <AvatarPicker
            options={avatarsForGender}
            selected={selectedAvatarKey}
            onSelect={(key) => setValue("avatar_key", key)}
          />
        )}

        {/* ── Password ── */}
        <div>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Create a password"
              className="w-full pr-12"
              {...register("password")}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors"
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10a13.35 13.35 0 0 0 9 4 13.35 13.35 0 0 0 9-4" /><path d="M12 14v4" /><path d="M8.5 13.5l-2 3" /><path d="M15.5 13.5l2 3" />
                </svg>
              )}
            </button>
          </div>
          {errors.password && (
            <p className="mt-1.5 px-4 text-xs text-red-500">{errors.password.message}</p>
          )}
        </div>

        {/* ── Confirm password ── */}
        <div>
          <div className="relative">
            <Input
              type={showConfirm ? "text" : "password"}
              placeholder="Confirm your password"
              className="w-full pr-12"
              {...register("password_confirmation")}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors"
            >
              {showConfirm ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 10a13.35 13.35 0 0 0 9 4 13.35 13.35 0 0 0 9-4" /><path d="M12 14v4" /><path d="M8.5 13.5l-2 3" /><path d="M15.5 13.5l2 3" />
                </svg>
              )}
            </button>
          </div>
          {errors.password_confirmation && (
            <p className="mt-1.5 px-4 text-xs text-red-500">{errors.password_confirmation.message}</p>
          )}
        </div>

        {/* ── Pre-filled notice ── */}
        {(prefilled_data.phone_number || prefilled_data.gender) && (
          <p className="text-xs text-[#A9AAAB] px-1">
            Some fields were pre-filled by your manager. You may update them before activating.
          </p>
        )}

        <Button type="submit" disabled={isPending} className="mt-2">
          {isPending ? "Activating account…" : "Activate Account"}
        </Button>
      </form>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function InternalOnboardingPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InternalOnboardingContent />
    </Suspense>
  );
}
