"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {
  createWorkspace,
  type ApiRequestError,
  type WorkspaceBaseValues,
} from "@/lib/api/onboarding";
import { getAuthTokenFromDocument, setOnboardingCompletedCookie } from "@/lib/auth/session";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
      .regex(/[0-9]/, "Password must contain at least one number."),
    password_confirmation: z.string().min(1, "Please confirm your password."),
  })
  .refine((d) => d.password === d.password_confirmation, {
    message: "Passwords do not match.",
    path: ["password_confirmation"],
  });

type PasswordValues = z.infer<typeof schema>;

type Props = {
  workspaceData: WorkspaceBaseValues;
};

const EyeOpen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 10a13.35 13.35 0 0 0 9 4 13.35 13.35 0 0 0 9-4" />
    <path d="M12 14v4" />
    <path d="M8.5 13.5l-2 3" />
    <path d="M15.5 13.5l2 3" />
  </svg>
);

export default function CreatePasswordForm({ workspaceData }: Props) {
  const router = useRouter();
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: PasswordValues) => {
      const token = getAuthTokenFromDocument();
      if (!token) throw new Error("Your session has expired. Please verify your email again.");
      return createWorkspace({ ...workspaceData, ...values }, token);
    },
    onSuccess: () => {
      setOnboardingCompletedCookie();
      router.push("/login");
    },
  });

  const apiError = mutation.error as ApiRequestError | Error | null;

  return (
    <form className="flex flex-col" onSubmit={handleSubmit((v) => mutation.mutate(v))}>
      <div className="relative mb-2">
        <Input
          type={show1 ? "text" : "password"}
          placeholder="Password"
          className="w-full pr-12"
          {...register("password")}
        />
        <button
          type="button"
          onClick={() => setShow1((v) => !v)}
          className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors focus:outline-none"
          tabIndex={-1}
        >
          {show1 ? <EyeOpen /> : <EyeOff />}
        </button>
      </div>
      {errors.password && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.password.message}</p>
      )}

      <div className="relative mt-4 mb-2">
        <Input
          type={show2 ? "text" : "password"}
          placeholder="Confirm Password"
          className="w-full pr-12"
          {...register("password_confirmation")}
        />
        <button
          type="button"
          onClick={() => setShow2((v) => !v)}
          className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors focus:outline-none"
          tabIndex={-1}
        >
          {show2 ? <EyeOpen /> : <EyeOff />}
        </button>
      </div>
      {errors.password_confirmation && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.password_confirmation.message}</p>
      )}

      {apiError && (
        <p className="text-xs text-red-500 text-center mb-4 mt-2">{apiError.message}</p>
      )}

      <Button type="submit" disabled={mutation.isPending} className="mt-10">
        {mutation.isPending ? "Creating account..." : "Create Password"}
      </Button>
    </form>
  );
}
