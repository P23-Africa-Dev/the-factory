"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { 
  User, 
  Mail, 
  Building2, 
  Globe, 
  Users, 
  MessageSquare, 
  ArrowLeft,
  CheckCircle2,
  ChevronRight
} from "lucide-react";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import {
  submitDemoRequest,
  type DemoRequestPayload,
  type TeamSizeRange,
} from "@/lib/api/enterprise";
import { ApiRequestError } from "@/lib/api/onboarding";
import { toast } from "sonner";

type Country = { name: { common: string }; cca2: string };

const teamSizeOptions: { label: string; value: TeamSizeRange }[] = [
  { label: "2-10", value: "2-10" },
  { label: "11-50", value: "11-50" },
  { label: "51-200", value: "51-200" },
  { label: "201-500", value: "201-500" },
  { label: "501+", value: "501+" },
];

const scheduleDemoSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  company_name: z.string().min(2, "Company name must be at least 2 characters."),
  country: z
    .string()
    .length(2, "Country must be a 2-letter ISO code.")
    .transform((value) => value.toUpperCase()),
  team_size: z.enum(["2-10", "11-50", "51-200", "201-500", "501+"]),
  use_case: z.string().min(10, "Use case should be at least 10 characters."),
});

export default function ScheduleDemoPage() {
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const { data: countryOptions = [] } = useQuery({
    queryKey: ["enterprise-demo-countries"],
    queryFn: async () => {
      const response = await fetch("https://restcountries.com/v3.1/all?fields=name,cca2");
      const data = (await response.json()) as Country[];

      return data
        .map((country) => ({
          label: country.name.common,
          value: country.cca2.toUpperCase(),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    staleTime: Infinity,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DemoRequestPayload>({
    resolver: zodResolver(scheduleDemoSchema),
    defaultValues: {
      full_name: "",
      email: "",
      company_name: "",
      country: "",
      team_size: "2-10",
      use_case: "",
    },
  });

  const requestMutation = useMutation({
    mutationFn: submitDemoRequest,
    onSuccess: (response) => {
      toast.success(response.message);
      setShowSuccessModal(true);
      reset();
    },
    onError: (error: ApiRequestError) => {
      toast.error(error.message || "Failed to submit demo request.");
    },
  });

  const apiErrors = useMemo(() => {
    const mutationError = requestMutation.error as ApiRequestError | null;
    return mutationError?.errors ?? null;
  }, [requestMutation.error]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#0A1618] selection:bg-[#6FA8A6]/30">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        {/* <Image
          src="/enterprise/demo-bg.png"
          alt="Enterprise Background"
          fill
          className="object-cover opacity-40 mix-blend-overlay"
          priority
        /> */}
        {/* <div className="absolute inset-0 bg-gradient-to-br from-[#0A1618] via-[#0A1618]/80 to-transparent" /> */}
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 py-12 md:px-12">
        {/* Back Link */}
        <div className="absolute left-6 top-8 md:hover:translate-x-[-4px] transition-transform">
          <Link href="/" className="group flex items-center gap-2 text-sm font-medium text-white/60 hover:text-white transition-colors">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors">
              <ArrowLeft size={14} />
            </div>
            Back to Home
          </Link>
        </div>

        <div className="w-full max-w-4xl space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <div className="text-center md:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 mb-6">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6FA8A6]">
                Enterprise Solutions
              </span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-white md:text-6xl lg:text-7xl">
              Scale your <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#6FA8A6] to-[#A3E635]">workflow</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/50">
              Transform your team&apos;s productivity with Factory 23. Tell us about your goals 
              {/* and we&apos;ll design a custom onboarding experience. */}
            </p>
          </div>

          <div className="grid gap-12 lg:grid-cols-[1.2fr_1fr]">
            {/* Form Section */}
            <div className="relative overflow-hidden rounded-[40px] border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
              <form className="space-y-5" onSubmit={handleSubmit((values) => requestMutation.mutate(values))}>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="group relative">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#6FA8A6] transition-colors">
                        <User size={18} />
                      </div>
                      <Input 
                        type="text" 
                        placeholder="Full name" 
                        className="bg-white/5 border-white/5 pl-14 text-white placeholder:text-white/20 focus:border-[#6FA8A6]/50 focus:bg-white/[0.08]" 
                        {...register("full_name")} 
                      />
                    </div>
                    {errors.full_name && <p className="px-4 text-[10px] font-medium text-red-400">{errors.full_name.message}</p>}
                    {apiErrors?.full_name && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.full_name[0]}</p>}
                  </div>

                  <div className="space-y-2">
                    <div className="group relative">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#6FA8A6] transition-colors">
                        <Mail size={18} />
                      </div>
                      <Input 
                        type="email" 
                        placeholder="Work email" 
                        className="bg-white/5 border-white/5 pl-14 text-white placeholder:text-white/20 focus:border-[#6FA8A6]/50 focus:bg-white/[0.08]" 
                        {...register("email")} 
                      />
                    </div>
                    {errors.email && <p className="px-4 text-[10px] font-medium text-red-400">{errors.email.message}</p>}
                    {apiErrors?.email && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.email[0]}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="group relative">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#6FA8A6] transition-colors">
                      <Building2 size={18} />
                    </div>
                    <Input 
                      type="text" 
                      placeholder="Company name" 
                      className="bg-white/5 border-white/5 pl-14 text-white placeholder:text-white/20 focus:border-[#6FA8A6]/50 focus:bg-white/[0.08]" 
                      {...register("company_name")} 
                    />
                  </div>
                  {errors.company_name && <p className="px-4 text-[10px] font-medium text-red-400">{errors.company_name.message}</p>}
                  {apiErrors?.company_name && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.company_name[0]}</p>}
                </div>

                <div className="grid gap-5 md:grid-cols-2 text-black">
                  <div className="space-y-2">
                    <Select
                      placeholder={countryOptions.length ? "Select country" : "Loading countries..."}
                      disabled={!countryOptions.length}
                      options={countryOptions}
                      className="bg-white/5 border-white/5 text-white focus:border-[#6FA8A6]/50"
                      {...register("country")}
                    />
                    {errors.country && <p className="px-4 text-[10px] font-medium text-red-400">{errors.country.message}</p>}
                    {apiErrors?.country && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.country[0]}</p>}
                  </div>

                  <div className="space-y-2 text-black">
                    <Select
                      placeholder="Select team size"
                      options={teamSizeOptions}
                      className="bg-white/5 border-white/5 text-white focus:border-[#6FA8A6]/50"
                      {...register("team_size")}
                    />
                    {errors.team_size && <p className="px-4 text-[10px] font-medium text-red-400">{errors.team_size.message}</p>}
                    {apiErrors?.team_size && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.team_size[0]}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="group relative">
                    <div className="absolute left-6 top-6 text-white/40 group-focus-within:text-[#6FA8A6] transition-colors">
                      <MessageSquare size={18} />
                    </div>
                    <textarea
                      className="min-h-[140px] w-full rounded-[28px] border border-white/5 bg-white/5 px-14 py-6 text-xs text-white shadow-2xl outline-none transition-all placeholder:text-white/20 focus:border-[#6FA8A6]/50 focus:bg-white/[0.08]"
                      placeholder="Use case (what do you want to improve with Factory 23?)"
                      {...register("use_case")}
                    />
                  </div>
                  {errors.use_case && <p className="px-4 text-[10px] font-medium text-red-400">{errors.use_case.message}</p>}
                  {apiErrors?.use_case && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.use_case[0]}</p>}
                </div>

                <Button 
                  type="submit" 
                  className="mt-4 h-16 w-full rounded-[24px] bg-[#6FA8A6] text-sm font-bold uppercase tracking-widest text-[#0A1618] hover:bg-[#A3E635] shadow-[0_4px_20px_rgba(111,168,166,0.3)] hover:shadow-[0_4px_20px_rgba(163,230,53,0.3)] active:scale-[0.98] transition-all" 
                  disabled={requestMutation.isPending}
                >
                  {requestMutation.isPending ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0A1618] border-t-transparent" />
                      Processing...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      Submit Request <ChevronRight size={18} />
                    </div>
                  )}
                </Button>
              </form>
            </div>

            {/* Info Section */}
            <div className="hidden flex-col justify-center gap-8 lg:flex">
                <div className="space-y-6">
                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#6FA8A6]/10 text-[#6FA8A6] border border-[#6FA8A6]/20">
                      <Users size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">Enterprise Scale</h3>
                      <p className="mt-1 text-sm text-white/40 leading-relaxed">Built for teams of all sizes, from growing startups to global corporations.</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#A3E635]/10 text-[#A3E635] border border-[#A3E635]/20">
                      <Globe size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">Global Support</h3>
                      <p className="mt-1 text-sm text-white/40 leading-relaxed">Dedicated account management and 24/7 technical assistance.</p>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-white/80 border border-white/10">
                      <CheckCircle2 size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-tight">Swift Onboarding</h3>
                      <p className="mt-1 text-sm text-white/40 leading-relaxed">Get started in days, not months, with our streamlined approval process.</p>
                    </div>
                  </div>
                </div>

                <div className="mt-10 rounded-[32px] border border-white/10 bg-gradient-to-br from-white/[0.05] to-transparent p-8">
                  <p className="italic text-white/60 text-sm leading-relaxed">
                    &quot;The Factory has revolutionized how we manage our global remote workforce. The schedule demo flow was the first step in a very professional partnership.&quot;
                  </p>
                  <div className="mt-6 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-[#6FA8A6] to-[#A3E635]" />
                    <div>
                      <p className="text-sm font-bold text-white">Sarah Jenkins</p>
                      <p className="text-[10px] uppercase font-bold tracking-widest text-white/30">Operations Director, Apex Corp</p>
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0A1618]/95 px-6 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-md overflow-hidden rounded-[40px] border border-white/10 bg-white/[0.02] p-1 shadow-2xl">
            <div className="rounded-[36px] bg-gradient-to-b from-white/[0.05] to-transparent p-10 text-center">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#6FA8A6]/10 text-[#6FA8A6] border-4 border-[#6FA8A6]/20">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">Request Received</h2>
              <p className="mt-4 text-white/50 leading-relaxed">
                Your demo request for <span className="font-bold text-white">Factory 23</span> has been submitted successfully. Our enterprise team will review your application and reach out within 24 hours.
              </p>
              <div className="mt-10 flex flex-col gap-4">
                <Button 
                  onClick={() => setShowSuccessModal(false)}
                  className="h-14 rounded-2xl bg-[#6FA8A6] text-[#0A1618] hover:bg-[#A3E635] font-bold shadow-lg transition-all"
                >
                  Return to Form
                </Button>
                <Link href="/" className="w-full">
                  <Button 
                    type="button" 
                    variant="outline"
                    className="h-14 rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10 font-bold transition-all"
                  >
                    Go to Homepage
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
