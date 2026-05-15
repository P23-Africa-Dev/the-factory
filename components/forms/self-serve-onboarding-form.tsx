"use client";

import { useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import {
  ApiRequestError,
  createWorkspace,
  getMe,
  type WorkspacePayload,
} from "@/lib/api/onboarding";
import {
  getAuthTokenFromDocument,
  setAuthSession,
  setCompanyId,
} from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";

const onboardingSchema = z.object({
  company_name: z.string().min(2, "Company name must be at least 2 characters."),
  country: z
    .string()
    .trim()
    .length(2, "Country must be a 2-letter ISO code (e.g. NG, US).")
    .regex(/^[A-Za-z]{2}$/, "Country must contain only letters."),
  team_size: z.enum(["solo", "2-10", "11-50", "51-200", "201-500", "500+"]),
  purpose: z.enum([
    "personal",
    "startup",
    "enterprise",
    "freelancing",
    "education",
    "non_profit",
    "other",
  ]),
  user_type: z.enum([
    "developer",
    "designer",
    "product_manager",
    "marketing",
    "sales",
    "operations",
    "founder",
    "student",
    "other",
  ]),
});

type SelfServeOnboardingValues = z.infer<typeof onboardingSchema>;

const teamSizeOptions = [
  { label: "Solo", value: "solo" },
  { label: "2-10", value: "2-10" },
  { label: "11-50", value: "11-50" },
  { label: "51-200", value: "51-200" },
  { label: "201-500", value: "201-500" },
  { label: "500+", value: "500+" },
];

const purposeOptions = [
  { label: "Personal", value: "personal" },
  { label: "Startup", value: "startup" },
  { label: "Enterprise", value: "enterprise" },
  { label: "Freelancing", value: "freelancing" },
  { label: "Education", value: "education" },
  { label: "Non-profit", value: "non_profit" },
  { label: "Other", value: "other" },
];

const userTypeOptions = [
  { label: "Developer", value: "developer" },
  { label: "Designer", value: "designer" },
  { label: "Product Manager", value: "product_manager" },
  { label: "Marketing", value: "marketing" },
  { label: "Sales", value: "sales" },
  { label: "Operations", value: "operations" },
  { label: "Founder", value: "founder" },
  { label: "Student", value: "student" },
  { label: "Other", value: "other" },
];

export default function SelfServeOnboardingForm() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<SelfServeOnboardingValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      company_name: "",
      country: "",
      team_size: "solo",
      purpose: "startup",
      user_type: "founder",
    },
  });

  const values = watch();

  const isFilled = useMemo(
    () =>
      values.company_name?.trim().length > 1 &&
      values.country?.trim().length === 2 &&
      Boolean(values.team_size) &&
      Boolean(values.purpose) &&
      Boolean(values.user_type),
    [values]
  );

  const completeMutation = useMutation({
    mutationFn: async (payload: WorkspacePayload) => {
      const token = getAuthTokenFromDocument();
      if (!token) {
        throw new ApiRequestError(
          "Your session has expired. Please verify OTP again.",
          401,
          null
        );
      }

      const workspaceResponse = await createWorkspace(payload, token);

      // Workspace endpoint rotates token. Persist the fresh one first.
      setAuthSession(workspaceResponse.data.token, true);

      const meResponse = await getMe(workspaceResponse.data.token);

      return {
        workspaceResponse,
        meResponse,
      };
    },
    onSuccess: ({ workspaceResponse, meResponse }) => {
      if (meResponse.data.active_company?.id) {
        setCompanyId(meResponse.data.active_company.id);
      }

      setUser({
        id: meResponse.data.id,
        name: meResponse.data.name,
        email: meResponse.data.email,
        avatar: meResponse.data.avatar,
        active_company: meResponse.data.active_company,
      });

      toast.success(workspaceResponse.message);
      router.push("/dashboard");
    },
    onError: (error) => {
      const err = error as ApiRequestError;

      if (err.status === 401) {
        toast.error("Your session expired. Please verify OTP again.");
        router.push("/verify-otp");
        return;
      }

      if (err.status === 409) {
        toast.success("Onboarding already completed. Redirecting to dashboard.");
        router.push("/dashboard");
        return;
      }

      toast.error(err.message || "Unable to complete onboarding.");
    },
  });

  const submit = (formValues: SelfServeOnboardingValues) => {
    completeMutation.mutate({
      company_name: formValues.company_name.trim(),
      country: formValues.country.trim().toUpperCase(),
      team_size: formValues.team_size,
      purpose: formValues.purpose,
      user_type: formValues.user_type,
    });
  };

  return (
    <form className="flex flex-col" onSubmit={handleSubmit(submit)}>
      <Input
        type="text"
        placeholder="Company Name"
        className="mb-2"
        {...register("company_name")}
      />
      {errors.company_name && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.company_name.message}</p>
      )}

      <Input
        type="text"
        placeholder="Country Code (e.g. NG)"
        className="mb-2 uppercase"
        maxLength={2}
        {...register("country")}
      />
      {errors.country && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.country.message}</p>
      )}

      <div className="mb-2">
        <Select
          placeholder="Select Team Size"
          options={teamSizeOptions}
          {...register("team_size")}
        />
      </div>
      {errors.team_size && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.team_size.message}</p>
      )}

      <div className="mb-2">
        <Select
          placeholder="Select Use Case"
          options={purposeOptions}
          {...register("purpose")}
        />
      </div>
      {errors.purpose && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.purpose.message}</p>
      )}

      <div className="mb-6">
        <Select
          placeholder="Select Your Role"
          options={userTypeOptions}
          {...register("user_type")}
        />
      </div>
      {errors.user_type && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.user_type.message}</p>
      )}

      <Button type="submit" disabled={completeMutation.isPending || !isFilled}>
        {completeMutation.isPending ? "Completing..." : "Complete Onboarding"}
      </Button>
    </form>
  );
}