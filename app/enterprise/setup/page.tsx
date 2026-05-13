"use client";

import { Suspense, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Logo from "@/assets/images/logo.png";
import Icon3d from "@/assets/images/3d-image.png";
import {
  completeEnterpriseSetup,
  getSetupInfo,
  type SetupInfoResponse,
} from "@/lib/api/enterprise";
import { ApiRequestError, getMe } from "@/lib/api/onboarding";
import { setAuthSession, setCompanyId } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";

/* ─── Validation schema ──────────────────────────────────────────────────────── */
const setupSchema = z
  .object({
    terms: z
      .boolean()
      .refine((val) => val === true, "You must agree to the terms."),
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

/* ─── Shared layout shell (replicates auth layout) ───────────────────────────── */
function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex flex-col md:flex-row min-h-screen md:h-screen w-screen overflow-y-auto md:overflow-hidden bg-[#6FA8A6]"
      style={{
        backgroundImage: `
          repeating-linear-gradient(to right, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px),
          repeating-linear-gradient(to bottom, rgba(0,0,0,0.008) 0, rgba(0,0,0,0.008) 4px, transparent 1px, transparent 50px)
        `,
      }}
    >
      {/* Mobile top wave */}
      <div className="md:hidden h-[220px] sm:h-[280px] shrink-0 relative">
        <div className="absolute bottom-0 left-0 right-0">
          <svg
            viewBox="0 0 390 200"
            fill="none"
            preserveAspectRatio="none"
            className="w-full h-[200px] block"
          >
            <path
              d="M0 200 L0 15 C80 0 160 140 250 150 C310 156 360 120 390 110 L390 200 Z"
              fill="white"
            />
          </svg>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="relative lg:max-w-[523px] md:w-[45%] lg:w-[40%] shrink-0 hidden md:flex flex-col md:px-10 lg:px-[101px] md:pt-[100px] lg:pt-[132px]">
        <Image src={Logo} alt="Factory 23 Logo" width={48} height={48} />

        <h1 className="text-[32px] lg:text-[40px] font-bold text-white md:leading-[60px] lg:leading-[83px] mt-4 md:mt-0">
          Factory 23
        </h1>
        <p className="text-white text-[14px] lg:text-[15px] leading-[18px] lg:leading-[16px] max-w-[240px]">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
          eiusmod
        </p>

        <Image
          src={Icon3d}
          alt="3D Objects"
          width={532}
          height={531}
          className="w-[532px] h-[531px] object-contain object-bottom absolute bottom-0 left-[240px] md:-right-[180px] lg:-right-[240px] z-10 pointer-events-none"
        />
      </div>

      {/* Right content panel */}
      <div className="flex-1 bg-white shadow-[shadow-[0px_2px_6px_2px_#00000026,0px_1px_2px_0px_#0000004D]] md:rounded-l-[50px] lg:rounded-l-[72px] flex items-start md:items-center justify-center py-6 sm:py-8 md:py-12 px-6 md:px-12 lg:pl-[210px] lg:pr-16 md:overflow-y-auto relative -mt-px md:mt-0">
        {children}
      </div>
    </div>
  );
}

/* ─── Show / hide password toggle icon ───────────────────────────────────────── */
function EyeToggle({
  show,
  onClick,
}: {
  show: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors focus:outline-none"
      tabIndex={-1}
    >
      {show ? (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ) : (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 10a13.35 13.35 0 0 0 9 4 13.35 13.35 0 0 0 9-4" />
          <path d="M12 14v4" />
          <path d="M8.5 13.5l-2 3" />
          <path d="M15.5 13.5l2 3" />
        </svg>
      )}
    </button>
  );
}

/* ─── Main content ───────────────────────────────────────────────────────────── */
function EnterpriseSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const [globalError, setGlobalError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const requestIdParam = searchParams.get("request_id");
  const tokenParam = searchParams.get("token");
  const requestId = requestIdParam ? Number(requestIdParam) : NaN;
  const hasValidParams =
    Number.isInteger(requestId) && requestId > 0 && Boolean(tokenParam);

  /* ── Fetch setup info ─────────────────────────────────────────────────────── */
  const setupInfoQuery = useQuery({
    queryKey: ["enterprise-setup-info", requestId, tokenParam],
    enabled: hasValidParams,
    queryFn: async () => getSetupInfo(requestId, tokenParam as string),
    retry: false,
  });

  /* ── Form ──────────────────────────────────────────────────────────────────── */
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SetupFormValues>({
    resolver: zodResolver(setupSchema),
    defaultValues: {
      terms: false,
      password: "",
      password_confirmation: "",
    },
  });

  const terms = watch("terms");
  const password = watch("password");
  const confirmPassword = watch("password_confirmation");
  const isFilled =
    terms && password.trim() !== "" && confirmPassword.trim() !== "";

  /* ── Mutation ──────────────────────────────────────────────────────────────── */
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
    onSuccess: async (response) => {
      const token = response.data.token;
      setAuthSession(token, true);
      toast.success(response.message);

      try {
        const meRes = await getMe(token);
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
        // /me failure is non-fatal — session is saved, dashboard will re-fetch
      }

      router.push("/dashboard");
    },
    onError: (error: ApiRequestError | Error) => {
      setGlobalError(error.message || "Unable to complete setup.");
      toast.error(error.message || "Unable to complete setup.");
    },
  });

  const setupInfo = setupInfoQuery.data?.data as SetupInfoResponse | undefined;

  /* ── Terminal error (invalid / expired link) ───────────────────────────────── */
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

  /* ── Error state — rendered inside the auth layout ─────────────────────────── */
  if (terminalError) {
    return (
      <AuthShell>
        <div className="w-full max-w-[460px] flex flex-col gap-8">
          <div className="text-left md:text-center flex flex-col gap-3">
            <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className="text-[32px] font-extrabold leading-10 tracking-[0px] text-gray-900 mb-2.5">
              Invalid Setup Link
            </h2>
            <p className="text-[14px] text-[#7D7F82] leading-relaxed">
              {terminalError}
            </p>
          </div>

          <Link href="/enterprise/schedule-demo">
            <Button type="button">Request a New Demo</Button>
          </Link>

          <p className="text-center text-xs text-[#A9AAAB]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-bold text-[#34373C] cursor-pointer hover:underline"
            >
              Log In.
            </Link>
          </p>
        </div>
      </AuthShell>
    );
  }

  /* ── Loading state — rendered inside the auth layout ───────────────────────── */
  if (setupInfoQuery.isLoading) {
    return (
      <AuthShell>
        <div className="w-full max-w-[460px] flex flex-col gap-8">
          <div className="text-left md:text-center flex flex-col gap-3">
            <h2 className="text-[32px] font-extrabold leading-10 tracking-[0px] text-gray-900 mb-2.5">
              Complete Enterprise Setup
            </h2>
            <p className="text-[14px] text-[#7D7F82] leading-relaxed">
              Validating your onboarding link…
            </p>
          </div>

          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-gray-200 border-t-[#6FA8A6]" />
          </div>
        </div>
      </AuthShell>
    );
  }

  /* ── Main form — rendered inside the auth layout ───────────────────────────── */
  return (
    <AuthShell>
      <div className="w-full max-w-[460px] flex flex-col gap-8">
        <div className="text-left md:text-center flex flex-col gap-3">
          <h2 className="text-[32px] font-extrabold leading-10 tracking-[0px] text-gray-900 mb-2.5">
            Complete Enterprise Setup
          </h2>
          <p className="text-[14px] text-[#7D7F82] leading-relaxed">
            Set your password to activate your enterprise account.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((values) => completeMutation.mutate(values))}
          className="flex flex-col"
          noValidate
        >
          {/* Terms checkbox */}
          <div className="flex items-start gap-4 mb-9 px-2 md:px-7">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                id="setup-terms"
                {...register("terms")}
                className="peer w-5 h-5 shrink-0 appearance-none rounded-md border-[1.5px] border-[#A9AAAB] bg-white checked:bg-[#6FA8A6] checked:border-[#6FA8A6] cursor-pointer transition-colors"
              />
              <svg
                className="absolute text-white pointer-events-none opacity-0 peer-checked:opacity-100 w-3 h-3"
                viewBox="0 0 10 8"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 4L3.5 6.5L9 1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex flex-col">
              <label
                htmlFor="setup-terms"
                className="text-[13px] md:text-sm text-[#A9AAAB] leading-5.5 cursor-pointer"
              >
                By using Factory 23, you agree to our{" "}
                <Link
                  href="#"
                  className="text-[#6FA8A6] font-bold underline decoration-[#6FA8A6] underline-offset-2 hover:text-[#5e9795] transition-colors"
                >
                  Terms, conditions and Privacy Policy.
                </Link>
              </label>
              {errors.terms && (
                <p className="mt-1 px-1 text-xs text-red-500">
                  {errors.terms.message}
                </p>
              )}
            </div>
          </div>

          {/* Company ID — read-only */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-[#A9AAAB] mb-1.5 px-7">
              Company ID
            </label>
            <Input
              value={setupInfo?.company_id ?? ""}
              readOnly
              disabled
              className="!bg-[#F4F7F9] !text-[#7D7F82] !cursor-not-allowed"
            />
          </div>

          {/* Email — read-only */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-[#A9AAAB] mb-1.5 px-7">
              Email Address
            </label>
            <Input
              type="email"
              value={setupInfo?.email ?? ""}
              readOnly
              disabled
              className="!bg-[#F4F7F9] !text-[#7D7F82] !cursor-not-allowed"
            />
          </div>

          {/* Password */}
          <div className="relative mb-6">
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Create password"
              className="w-full pr-12"
              {...register("password")}
            />
            <EyeToggle
              show={showPassword}
              onClick={() => setShowPassword(!showPassword)}
            />
            {errors.password && (
              <p className="mt-1.5 px-1 text-xs text-red-500">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="relative mb-6">
            <Input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm password"
              className="w-full pr-12"
              {...register("password_confirmation")}
            />
            <EyeToggle
              show={showConfirmPassword}
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            />
            {errors.password_confirmation && (
              <p className="mt-1.5 px-1 text-xs text-red-500">
                {errors.password_confirmation.message}
              </p>
            )}
          </div>

          {/* Global / server error */}
          {(globalError ||
            (completeMutation.error &&
              (completeMutation.error as ApiRequestError).errors
                ?.request_id?.[0])) && (
            <p className="mb-4 px-1 text-sm text-red-500 text-center">
              {globalError ||
                (completeMutation.error as ApiRequestError).errors
                  ?.request_id?.[0]}
            </p>
          )}

          {/* Password requirements hint */}
          <div className="mb-8 px-2 md:px-7">
            <p className="text-[11px] text-[#A9AAAB] leading-relaxed">
              Password must be at least 8 characters and include at least one
              letter and one number.
            </p>
          </div>

          <Button
            type="submit"
            disabled={!isFilled || completeMutation.isPending}
          >
            {completeMutation.isPending
              ? "Completing setup…"
              : "Complete Setup"}
          </Button>

          <p className="text-center text-xs mt-4 text-[#A9AAAB]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-bold text-[#34373C] cursor-pointer hover:underline"
            >
              Log In.
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}

export default function EnterpriseSetupPage() {
  return (
    <Suspense>
      <EnterpriseSetupContent />
    </Suspense>
  );
}
