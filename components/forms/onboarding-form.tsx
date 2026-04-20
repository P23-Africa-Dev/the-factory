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
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";

const workspaceSchema = z.object({
  company_name: z.string().min(2, "Company name must be at least 2 characters."),
  country: z.string().min(1, "Please select a country."),
  team_size: z.enum(["solo", "2-10", "11-50", "51-200", "201-500", "500+"]),
  purpose: z.enum([
    "personal", "startup", "enterprise", "freelancing",
    "education", "non_profit", "other",
  ]),
  user_type: z.enum([
    "developer", "designer", "product_manager", "marketing",
    "sales", "operations", "founder", "student", "other",
  ]),
});

type Country = { name: { common: string }; cca2: string };

export default function OnboardingForm() {
  const router = useRouter();

  const { data: countryOptions = [] } = useQuery({
    queryKey: ["countries"],
    queryFn: async () => {
      const res = await fetch("https://restcountries.com/v3.1/all?fields=name,cca2");
      const data: Country[] = await res.json();
      return data
        .map((c) => ({ label: c.name.common, value: c.cca2 }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    staleTime: Infinity,
  });

  const {
    register,
    handleSubmit,
    control,
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

  const [companyNameValue, countryValue] = useWatch({
    control,
    name: ["company_name", "country"],
  });
  const isFilled = companyNameValue?.trim() !== "" && countryValue?.trim() !== "";

  const workspaceMutation = useMutation({
    mutationFn: (values: WorkspacePayload) => {
      const token = getAuthTokenFromDocument();
      if (!token) throw new Error("Your session has expired. Please verify your email again.");
      return createWorkspace(values, token);
    },
    onSuccess: (res) => {
      setOnboardingCompletedCookie();
      toast.success(res.message);
      router.push("/login");
    },
    onError: (err: ApiRequestError | Error) => {
      toast.error(err.message);
    },
  });

  const apiError = workspaceMutation.error as ApiRequestError | Error | null;

  return (
    <form className="flex flex-col" onSubmit={handleSubmit((v) => workspaceMutation.mutate(v))}>
      <Input
        type="text"
        placeholder="Company Name"
        className="mb-2"
        {...register("company_name")}
      />
      {errors.company_name && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.company_name.message}</p>
      )}

      <div className="mb-2">
        <Select
          placeholder={countryOptions.length ? "Select Country" : "Loading countries..."}
          disabled={!countryOptions.length}
          {...register("country")}
          options={countryOptions}
        />
      </div>
      {errors.country && (
        <p className="text-xs text-red-500 mb-4 px-4">{errors.country.message}</p>
      )}

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

      {apiError && (
        <p className="text-xs text-red-500 text-center mb-4">{apiError.message}</p>
      )}

      <Button type="submit" disabled={!isFilled || workspaceMutation.isPending}>
        {workspaceMutation.isPending ? "Finishing..." : "Continue"}
      </Button>
    </form>
  );
}
