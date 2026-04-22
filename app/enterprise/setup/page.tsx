"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  completeEnterpriseSetup,
  getSetupInfo,
  type SetupInfoResponse,
} from "@/lib/api/enterprise";
import { ApiRequestError } from "@/lib/api/onboarding";
import { setAuthSession } from "@/lib/auth/session";
import { toast } from "sonner";

const setupSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[a-zA-Z]/, "Password must include at least one letter.")
      .regex(/[0-9]/, "Password must include at least one number."),
    password_confirmation: z.string().min(1, "Please confirm your password."),
  })
  .refine((values) => values.password === values.password_confirmation, {
    message: "Passwords do not match.",
    path: ["password_confirmation"],
  });

type SetupFormValues = z.infer<typeof setupSchema>;

export default function EnterpriseSetupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [globalError, setGlobalError] = useState("");

  const requestIdParam = searchParams.get("request_id");
  const tokenParam = searchParams.get("token");
  const requestId = requestIdParam ? Number(requestIdParam) : NaN;
  const hasValidParams = Number.isInteger(requestId) && requestId > 0 && Boolean(tokenParam);

  const setupInfoQuery = useQuery({
    queryKey: ["enterprise-setup-info", requestId, tokenParam],
    enabled: hasValidParams,
    queryFn: async () => getSetupInfo(requestId, tokenParam as string),
    retry: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      password: "",
      password_confirmation: "",
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (values: SetupFormValues) => {
      if (!hasValidParams || !setupInfoQuery.data?.data) {
        throw new Error("Missing onboarding context.");
      }

      return completeEnterpriseSetup({
        request_id: requestId,
        token: tokenParam as string,
        company_id: setupInfoQuery.data.data.company_id,
        password: values.password,
        password_confirmation: values.password_confirmation,
      });
    },
    onSuccess: (response) => {
      setAuthSession(response.data.token, true);
      toast.success(response.message);
      router.push("/dashboard");
    },
    onError: (error: ApiRequestError | Error) => {
      setGlobalError(error.message || "Unable to complete setup.");
      toast.error(error.message || "Unable to complete setup.");
    },
  });

  const setupInfo = setupInfoQuery.data?.data as SetupInfoResponse | undefined;

  const terminalError = useMemo(() => {
    if (!hasValidParams) {
      return "This onboarding link is invalid. Please check your email and try again.";
    }

    const queryError = setupInfoQuery.error as ApiRequestError | null;
    if (!queryError) {
      return "";
    }

    if (queryError.status === 422) {
      return "This onboarding link is invalid or has expired. Please contact support for a new link.";
    }

    return queryError.message || "Unable to validate your onboarding link.";
  }, [hasValidParams, setupInfoQuery.error]);

  if (terminalError) {
    return (
      <div className="min-h-screen bg-[#6FA8A6] px-6 py-10 md:px-12"
        style={{
          backgroundImage: `
            repeating-linear-gradient(to right, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px),
            repeating-linear-gradient(to bottom, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px)
          `,
        }}
      >
        <div className="mx-auto mt-12 w-full max-w-xl rounded-[32px] bg-white p-8 text-center shadow-[0px_2px_6px_2px_#00000026,0px_1px_2px_0px_#0000004D]">
          <h1 className="text-3xl font-extrabold text-[#34373C]">Invalid Setup Link</h1>
          <p className="mt-4 text-sm text-[#7D7F82]">{terminalError}</p>
          <Link href="/enterprise/schedule-demo" className="mx-auto mt-6 block w-[220px]">
            <Button type="button">Request a New Demo</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#6FA8A6] px-6 py-10 md:px-12"
      style={{
        backgroundImage: `
          repeating-linear-gradient(to right, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px),
          repeating-linear-gradient(to bottom, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px)
        `,
      }}
    >
      <div className="mx-auto w-full max-w-2xl rounded-[36px] bg-white p-6 shadow-[0px_2px_6px_2px_#00000026,0px_1px_2px_0px_#0000004D] md:p-10">
        <h1 className="text-3xl font-extrabold text-[#34373C] md:text-4xl">
          Complete Enterprise Setup
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#7D7F82]">
          Set your password to activate your enterprise account.
        </p>

        {setupInfoQuery.isLoading ? (
          <div className="mt-8 rounded-2xl bg-[#F4F7F9] p-5 text-sm font-medium text-[#7D7F82]">
            Validating your onboarding link...
          </div>
        ) : (
          <form
            className="mt-8 space-y-4"
            onSubmit={handleSubmit((values) => completeMutation.mutate(values))}
          >
            <Input value={setupInfo?.email ?? ""} readOnly disabled />
            <Input value={setupInfo?.company_id ?? ""} readOnly disabled />

            <Input
              type="password"
              placeholder="Create password"
              {...register("password")}
            />
            {errors.password && <p className="px-4 text-xs text-red-500">{errors.password.message}</p>}

            <Input
              type="password"
              placeholder="Confirm password"
              {...register("password_confirmation")}
            />
            {errors.password_confirmation && (
              <p className="px-4 text-xs text-red-500">{errors.password_confirmation.message}</p>
            )}

            {(globalError ||
              (completeMutation.error &&
                (completeMutation.error as ApiRequestError).errors?.request_id?.[0])) && (
              <p className="px-4 text-xs text-red-500">
                {globalError || (completeMutation.error as ApiRequestError).errors?.request_id?.[0]}
              </p>
            )}

            <Button type="submit" className="mt-2" disabled={completeMutation.isPending}>
              {completeMutation.isPending ? "Completing setup..." : "Complete Setup"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
