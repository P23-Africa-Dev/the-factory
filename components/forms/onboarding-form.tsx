"use client";

import { ApiRequestError, getMe } from "@/lib/api/onboarding";
import {
  completeInternalInvitation,
  listAvatars,
  previewInternalInvitation,
} from "@/lib/api/internal-onboarding";
import { setAuthSession, setCompanyId } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import PhoneNumberInput from "@/components/ui/phone-number-input";
import { z } from "zod";
import { toast } from "sonner";

const onboardingSchema = z
  .object({
    phone_number: z.string().min(1, "Phone number is required."),
    gender: z.enum(["male", "female"]),
    avatar_key: z.string().optional(),
    avatar_file: z.instanceof(File).optional(),
    password: z.string().min(8, "Password must be at least 8 characters."),
    password_confirmation: z.string().min(8, "Password confirmation is required."),
  })
  .refine((values) => values.password === values.password_confirmation, {
    path: ["password_confirmation"],
    message: "Passwords do not match.",
  })
  .superRefine((values, ctx) => {
    if (!values.avatar_key && !values.avatar_file) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["avatar_key"],
        message: "Select an avatar or upload a custom image.",
      });
    }
  });

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

const INVITATION_ID_REGEX = /^[0-9]+$/;
const INVITE_TOKEN_REGEX = /^[A-Za-z0-9_-]{32,128}$/;
const AVATAR_BATCH_SIZE = 4;

function shuffleArray<T>(items: T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

type AvatarOption = { key: string; url: string | null; svg: string | null };

function AvatarPicker({
  avatars,
  selectedAvatarKey,
  onSelect,
}: {
  avatars: AvatarOption[];
  selectedAvatarKey?: string;
  onSelect: (avatarKey: string) => void;
}) {
  const [visibleAvatarCount, setVisibleAvatarCount] = useState(AVATAR_BATCH_SIZE);
  const [failedImageKeys, setFailedImageKeys] = useState<Set<string>>(new Set());
  const shuffledAvatars = useMemo(() => shuffleArray(avatars), [avatars]);
  const visibleAvatars = useMemo(
    () => shuffledAvatars.slice(0, visibleAvatarCount),
    [shuffledAvatars, visibleAvatarCount]
  );

  if (visibleAvatars.length === 0) {
    return <p className="text-xs text-gray-400 text-center">No avatars available for selected gender.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 justify-center">
      {visibleAvatars.map((avatar) => {
        const isSelected = selectedAvatarKey === avatar.key;
        const shouldRenderImage = Boolean(avatar.url) && !failedImageKeys.has(avatar.key);
        return (
          <button
            key={avatar.key}
            type="button"
            onClick={() => onSelect(avatar.key)}
            className={`h-16 w-16 rounded-full overflow-hidden border-2 transition-all ${
              isSelected ? "border-[#6FA8A6] ring-2 ring-[#6FA8A6]/30" : "border-gray-200"
            }`}
            title={avatar.key}
          >
            {shouldRenderImage ? (
              <img
                src={avatar.url ?? ""}
                alt={avatar.key}
                className="h-full w-full object-cover"
                onError={() =>
                  setFailedImageKeys((previous) => {
                    const next = new Set(previous);
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
        );
      })}
      {visibleAvatarCount < shuffledAvatars.length ? (
        <button
          type="button"
          onClick={() =>
            setVisibleAvatarCount((count) =>
              Math.min(count + AVATAR_BATCH_SIZE, shuffledAvatars.length)
            )
          }
          className="h-16 w-16 rounded-2xl border border-gray-300 text-3xl text-gray-400 hover:bg-gray-50"
          aria-label="Load more avatars"
        >
          +
        </button>
      ) : null}
    </div>
  );
}

export default function OnboardingForm({
  invitationId,
  token,
}: {
  invitationId: string;
  token: string;
}) {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const previewQuery = useQuery({
    queryKey: ["internal-onboarding-preview", invitationId, token],
    queryFn: () =>
      previewInternalInvitation({
        invitation_id: invitationId,
        token,
      }),
    enabled: Boolean(invitationId && token),
    retry: false,
  });

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      phone_number: "",
      gender: "male",
      avatar_key: "",
      avatar_file: undefined,
      password: "",
      password_confirmation: "",
    },
  });

  const completeMutation = useMutation({
    mutationFn: (values: OnboardingFormValues) =>
      completeInternalInvitation({
        invitation_id: invitationId,
        token,
        password: values.password,
        password_confirmation: values.password_confirmation,
        phone_number: values.phone_number,
        gender: values.gender,
        avatar_key: values.avatar_key,
        avatar_file: values.avatar_file,
      }),
    onSuccess: async (res) => {
      const authToken = res.data.token;
      setAuthSession(authToken, true);
      toast.success(res.message);

      try {
        const meRes = await getMe(authToken);
        if (meRes.data.active_company?.id) {
          setCompanyId(meRes.data.active_company.id);
        }
        setUser({
          id: meRes.data.id,
          name: meRes.data.name,
          email: meRes.data.email,
          avatar: meRes.data.avatar,
          active_company: meRes.data.active_company,
        });
      } catch {
        // no-op: session is already saved
      }

      router.push("/dashboard");
    },
    onError: (err: ApiRequestError | Error) => {
      if (err instanceof ApiRequestError && err.errors?.avatar_file?.[0]) {
        setError("avatar_file", { message: err.errors.avatar_file[0] });
      }
      toast.error(err.message);
    },
  });

  const apiError = completeMutation.error as ApiRequestError | Error | null;
  const selectedGender = useWatch({ control, name: "gender" });
  const phoneNumber = useWatch({ control, name: "phone_number" });
  const selectedAvatarKey = useWatch({ control, name: "avatar_key" });
  const selectedAvatarFile = useWatch({ control, name: "avatar_file" });
  const hasValidInviteParams =
    INVITATION_ID_REGEX.test(invitationId) && INVITE_TOKEN_REGEX.test(token);
  const preview = previewQuery.data?.data;
  const [customAvatarPreview, setCustomAvatarPreview] = useState<string | null>(null);
  const hasPreviewAvatarOptions =
    Boolean(preview?.avatar_options_by_gender?.[selectedGender]?.length);
  const shouldFetchAvatarsFromApi =
    Boolean(selectedGender) && previewQuery.isSuccess && !hasPreviewAvatarOptions;

  const genderAvatarsQuery = useQuery({
    queryKey: ["internal-gender-avatars", selectedGender],
    queryFn: () => listAvatars(selectedGender),
    enabled: shouldFetchAvatarsFromApi,
    staleTime: 60_000,
    retry: false,
  });

  const avatarOptions = useMemo(() => {
    const apiData = genderAvatarsQuery.data?.data ?? [];
    if (apiData.length > 0) return apiData;

    return (
      preview?.avatar_options_by_gender?.[selectedGender] ??
      preview?.avatar_options ??
      []
    );
  }, [genderAvatarsQuery.data, preview, selectedGender]);

  useEffect(() => {
    if (!selectedAvatarFile) {
      if (customAvatarPreview) {
        URL.revokeObjectURL(customAvatarPreview);
      }

      setCustomAvatarPreview(null);
      return;
    }

    const nextPreview = URL.createObjectURL(selectedAvatarFile);
    setCustomAvatarPreview(nextPreview);

    return () => {
      URL.revokeObjectURL(nextPreview);
    };
  }, [selectedAvatarFile]);

  useEffect(() => {
    if (!preview || phoneNumber || !preview.prefilled_data.phone_number) return;
    const rawPhone = preview.prefilled_data.phone_number.replace(/\s+/g, "");
    setValue("phone_number", rawPhone);
  }, [phoneNumber, preview, setValue]);

  useEffect(() => {
    if (!preview || selectedAvatarKey) return;
    const randomized = shuffleArray(avatarOptions);
    const preferredAvatar =
      preview.prefilled_data.avatar_key ?? preview.suggested_avatar_key ?? randomized[0]?.key;
    if (preferredAvatar) {
      setValue("avatar_key", preferredAvatar);
    }
  }, [avatarOptions, preview, selectedAvatarKey, setValue]);

  if (!hasValidInviteParams) {
    return (
      <p className="text-xs text-red-500 text-center mb-4">
        Invalid invitation link. Please request a fresh invite.
      </p>
    );
  }

  if (previewQuery.isError || (previewQuery.isSuccess && !previewQuery.data?.success)) {
    return (
      <p className="text-xs text-red-500 text-center mb-4">
        This invitation is invalid or has expired.
      </p>
    );
  }

  return (
    <form className="flex flex-col" onSubmit={handleSubmit((v) => completeMutation.mutate(v))}>
      {previewQuery.isPending && (
        <p className="text-xs text-gray-500 text-center mb-3">Loading invitation details...</p>
      )}

      <Input
        type="text"
        placeholder="Full Name"
        className="mb-2 bg-gray-50 text-gray-500"
        value={preview?.user.name ?? ""}
        disabled
        readOnly
      />

      <Input
        type="email"
        placeholder="Email"
        className="mb-2 bg-gray-50 text-gray-500"
        value={preview?.user.email ?? ""}
        disabled
        readOnly
      />

      <div className="mb-2">
        <Controller
          control={control}
          name="phone_number"
          render={({ field }) => (
            <PhoneNumberInput
              variant="default"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>
      {errors.phone_number && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.phone_number.message}</p>
      )}

      <div className="mb-2">
        <Select
          placeholder="Select Gender"
          {...register("gender", {
            onChange: () => {
              setValue("avatar_key", "", { shouldValidate: true });
              setValue("avatar_file", undefined, { shouldValidate: true });
              clearErrors(["avatar_key", "avatar_file"]);
            },
          })}
          options={[
            { label: "Male", value: "male" },
            { label: "Female", value: "female" },
          ]}
        />
      </div>
      {errors.gender && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.gender.message}</p>
      )}

      <div className="mb-2">
        <input type="hidden" {...register("avatar_key")} />

        <div className="mb-3 rounded-lg border border-dashed border-gray-300 p-3">
          <label className="text-xs text-gray-500 block mb-2">Upload custom avatar (optional)</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;

              setValue("avatar_file", file, { shouldValidate: true });
              setValue("avatar_key", "", { shouldValidate: true });
              clearErrors(["avatar_key", "avatar_file"]);
            }}
            className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium"
          />

          {customAvatarPreview && (
            <div className="mt-3 flex items-center gap-3">
              <img
                src={customAvatarPreview}
                alt="Custom avatar preview"
                className="h-14 w-14 rounded-full object-cover border border-gray-200"
              />
              <button
                type="button"
                onClick={() => {
                  setValue("avatar_file", undefined, { shouldValidate: true });
                  clearErrors("avatar_file");
                }}
                className="text-xs text-red-500 hover:text-red-600"
              >
                Remove upload
              </button>
            </div>
          )}
        </div>

        {genderAvatarsQuery.isPending && (
          <p className="text-xs text-gray-400 text-center mb-2">Loading avatars...</p>
        )}

        <p className="text-sm text-gray-500 mb-2 text-center">Or, select any avatar of your choice</p>
        <AvatarPicker
          key={`${selectedGender}-${avatarOptions.length}`}
          avatars={avatarOptions}
          selectedAvatarKey={selectedAvatarKey}
          onSelect={(avatarKey) => {
            setValue("avatar_key", avatarKey, { shouldValidate: true });
            setValue("avatar_file", undefined, { shouldValidate: true });
            clearErrors(["avatar_key", "avatar_file"]);
          }}
        />
      </div>
      {errors.avatar_key && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.avatar_key.message}</p>
      )}
      {errors.avatar_file && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.avatar_file.message}</p>
      )}

      <Input type="password" placeholder="Password" className="mb-2" {...register("password")} />
      {errors.password && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.password.message}</p>
      )}

      <Input
        type="password"
        placeholder="Confirm Password"
        className="mb-6"
        {...register("password_confirmation")}
      />
      {errors.password_confirmation && (
        <p className="text-xs text-red-500 mb-4 px-4">
          {errors.password_confirmation.message}
        </p>
      )}

      {apiError && (
        <p className="text-xs text-red-500 text-center mb-4">{apiError.message}</p>
      )}

      <Button type="submit" disabled={completeMutation.isPending || previewQuery.isPending || !preview}>
        {previewQuery.isPending
          ? "Loading invitation..."
          : completeMutation.isPending
            ? "Finishing..."
            : "Complete Onboarding"}
      </Button>
    </form>
  );
}
