"use client";

import {
  createWorkspace,
  type ApiRequestError,
  type WorkspacePayload,
} from "@/lib/api/onboarding";
import {
  getAuthTokenFromDocument,
  setOnboardingCompletedCookie,
} from "@/lib/auth/session";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

const workspaceSchema = z.object({
  company_name: z
    .string()
    .min(2, "Company name must be at least 2 characters long."),
  country: z
    .string()
    .length(2, "Country must be a 2-letter country code.")
    .transform((value) => value.toUpperCase()),
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

export default function OnboardingForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<WorkspacePayload>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: {
      company_name: "",
      country: "",
      team_size: "2-10",
      purpose: "startup",
      user_type: "founder",
    },
  });

  const workspaceMutation = useMutation({
    mutationFn: (values: WorkspacePayload) => {
      const token = getAuthTokenFromDocument();

      if (!token) {
        throw new Error("Your session has expired. Please verify your email again.");
      }

      return createWorkspace(values, token);
    },
    onSuccess: () => {
      setOnboardingCompletedCookie();
      router.push("/dashboard");
    },
  });

  const onSubmit = (values: WorkspacePayload) => {
    workspaceMutation.mutate(values);
  };

  const apiError = workspaceMutation.error as ApiRequestError | Error | null;

  return (
    <form className="flex flex-col" onSubmit={handleSubmit(onSubmit)}>
      <h3 className="text-center text-[#34373C] font-bold text-sm sm:text-[15px] mb-6 mt-[-10px] md:mt-[-16px]">
        Create a Workspace
      </h3>

      <Input
        type="text"
        placeholder="Company Name"
        className="mb-2"
        {...register("company_name")}
      />
      {errors.company_name ? (
        <p className="text-xs text-red-500 mb-4 px-4">
          {errors.company_name.message}
        </p>
      ) : null}

      <Input type="text" placeholder="Country (e.g. NG)" className="mb-2" {...register("country")} />
      {errors.country ? (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.country.message}</p>
      ) : null}

      <div className="mb-6">
        <Select
          placeholder="Team Size"
          {...register("team_size")}
          options={[
            { label: "Solo", value: "solo" },
            { label: "2-10", value: "2-10" },
            { label: "11-50", value: "11-50" },
            { label: "51-200", value: "51-200" },
            { label: "201-500", value: "201-500" },
            { label: "500+", value: "500+" },
          ]}
        />
      </div>

      <div className="mb-6">
        <Select
          placeholder="What are you using this tool for?"
          {...register("purpose")}
          options={[
            { label: "Personal Project", value: "personal" },
            { label: "Startup", value: "startup" },
            { label: "Enterprise", value: "enterprise" },
            { label: "Freelancing", value: "freelancing" },
            { label: "Education", value: "education" },
            { label: "Non-profit", value: "non_profit" },
            { label: "Other", value: "other" },
          ]}
        />
      </div>

      <div className="mb-14">
        <Select
          placeholder="What best describes you"
          {...register("user_type")}
          options={[
            { label: "Founder / Executive", value: "founder" },
            { label: "Developer", value: "developer" },
            { label: "Designer", value: "designer" },
            { label: "Product Manager", value: "product_manager" },
            { label: "Marketing", value: "marketing" },
            { label: "Sales", value: "sales" },
            { label: "Operations", value: "operations" },
            { label: "Student", value: "student" },
            { label: "Other", value: "other" },
          ]}
        />
      </div>

      {apiError ? (
        <p className="text-xs text-red-500 text-center mb-4">
          {apiError.message}
        </p>
      ) : null}

      <Button type="submit" disabled={workspaceMutation.isPending}>
        {workspaceMutation.isPending ? "Finishing..." : "Continue"}
      </Button>
    </form>
  );
}
