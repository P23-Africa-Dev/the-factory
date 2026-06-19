"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
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
  ChevronRight,
  Headphones
} from "lucide-react";
import Logo from "@/assets/images/logo.png";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  getCountries,
  submitDemoRequest,
  type DemoRequestPayload,
  type TeamSizeRange,
} from "@/lib/api/enterprise";
import { ApiRequestError } from "@/lib/api/onboarding";
import { toast } from "sonner";

const scheduleDemoSchema = z.object({
  full_name: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
  company_name: z.string().min(2, "Company name must be at least 2 characters."),
  country: z.string().min(2, "Please select a country."),
  team_size: z.enum(["2-10", "11-50", "51-200", "201-500", "501+"]),
  use_case: z.string().min(10, "Use case should be at least 10 characters."),
});

const teamSizeOptions: { label: string; value: TeamSizeRange }[] = [
  { label: "2-10", value: "2-10" },
  { label: "11-50", value: "11-50" },
  { label: "51-200", value: "51-200" },
  { label: "201-500", value: "201-500" },
  { label: "501+", value: "501+" },
];

const countrySelectClassName =
  "w-full h-15 px-7 rounded-full border shadow-[0px_1px_2px_0px_#0000004D] border-white/5 bg-white/5 text-xs text-white outline-none focus:border-[#6FA8A6]/50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";

export default function ScheduleDemoPage() {
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const {
    data: countryOptions = [],
    isPending: isCountriesPending,
    isError: isCountriesError,
  } = useQuery({
    queryKey: ["enterprise-demo-countries"],
    queryFn: getCountries,
    retry: 1,
    staleTime: Infinity,
  });

  const countriesToRender = countryOptions;

  const {
    register,
    control,
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
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white font-sans overflow-x-hidden relative">
      {/* Left Pane (White background with grid texture) */}
      <div className="w-full lg:w-[46%] bg-white flex flex-col justify-between p-6 sm:p-10 lg:p-16 min-h-screen lg:min-h-0 relative bg-[radial-gradient(#e5e7eb_1.5px,transparent_1.5px)] [background-size:24px_24px]">
        
        {/* Left Header/Navbar */}
        <header className="flex items-center gap-6 sm:gap-12 w-full">
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src={Logo}
              alt="Factory 23 Logo"
              width={54}
              height={54}
              className="object-contain"
              priority
            />
          </Link>
          
          <nav className="hidden sm:flex items-center gap-8">
            <Link href="#" className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
              About
            </Link>
            <Link href="#" className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
              Pricing
            </Link>
            <Link href="#" className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
              Reviews
            </Link>
          </nav>
        </header>

        {/* Left Hero Panel */}
        <main className="my-auto py-16 lg:py-0 flex flex-col justify-center max-w-md">
          {/* Back button link */}
          <Link 
            href="/" 
            className="group inline-flex items-center gap-2 text-sm font-bold text-[#0B252C]/60 hover:text-[#0B252C] transition-colors mb-8"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
            Back to Home
          </Link>

          <h1 className="text-5xl lg:text-[64px] font-extrabold text-[#0B252C] leading-[1.1] tracking-[-0.02em] mb-6">
            Schedule <br />
            Your Demo
          </h1>
          <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed max-w-sm">
            Pick a convenient date and time for your demo. You'll receive a confirmation email once it's booked.
          </p>
        </main>

        {/* Green Accent Pill at Bottom-Left */}
        <div className="absolute bottom-16 left-0 w-32 h-20 bg-[#9BDD7C] rounded-r-full" />
      </div>

      {/* Right Pane (Dark Teal Background) */}
      <div className="w-full lg:w-[54%] bg-[#0B252C] flex flex-col justify-between p-6 sm:p-10 lg:p-16 relative min-h-screen lg:min-h-0">
        
        {/* Right Header Navigation */}
        <div className="flex items-center justify-between w-full z-10">
          <Link href="#" className="text-sm font-semibold text-white/90 hover:opacity-80 transition-opacity">
            P23 Africa
          </Link>
          
          <div className="flex items-center gap-4">
            <Link href="/login" className="px-6 h-12 border border-white/30 text-white text-xs font-semibold rounded-full flex items-center justify-center gap-2 hover:border-white/60 hover:bg-white/5 active:scale-[0.98] transition-all">
              <User className="w-4 h-4 stroke-[2.5]" />
              Log In
            </Link>
            <Link href="/enterprise/schedule-demo">
              <button className="px-6 h-12 bg-white text-[#0B252C] text-xs font-bold rounded-full shadow-[0px_2px_8px_rgba(0,0,0,0.1)] hover:bg-white/95 active:scale-[0.98] transition-all cursor-pointer">
                Book a Demo
              </button>
            </Link>
          </div>
        </div>

        {/* Centered Contact Form Card */}
        <div className="flex-1 flex items-center justify-center z-10 py-12 lg:py-0">
          <div className="w-full max-w-[500px] bg-black/15 border border-white/10 rounded-[32px] p-6 sm:p-8 flex flex-col gap-6 shadow-[0px_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-md">
            
            <form className="flex flex-col gap-5" onSubmit={handleSubmit((values) => requestMutation.mutate(values))}>
              {/* Row 1: Full name & Work email */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <div className="group relative">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/45 group-focus-within:text-[#6FA8A6] transition-colors">
                      <User size={18} />
                    </div>
                    <input 
                      type="text" 
                      placeholder="Full name" 
                      className="w-full h-14 pl-14 pr-6 rounded-full border border-white/10 bg-white/[0.03] text-xs text-white placeholder:text-white/30 outline-none focus:border-[#6FA8A6]/50 focus:bg-white/[0.06] transition-all"
                      {...register("full_name")} 
                    />
                  </div>
                  {errors.full_name && <p className="px-4 text-[10px] font-medium text-red-400">{errors.full_name.message}</p>}
                  {apiErrors?.full_name && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.full_name[0]}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="group relative">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/45 group-focus-within:text-[#6FA8A6] transition-colors">
                      <Mail size={18} />
                    </div>
                    <input 
                      type="email" 
                      placeholder="Work email" 
                      className="w-full h-14 pl-14 pr-6 rounded-full border border-white/10 bg-white/[0.03] text-xs text-white placeholder:text-white/30 outline-none focus:border-[#6FA8A6]/50 focus:bg-white/[0.06] transition-all"
                      {...register("email")} 
                    />
                  </div>
                  {errors.email && <p className="px-4 text-[10px] font-medium text-red-400">{errors.email.message}</p>}
                  {apiErrors?.email && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.email[0]}</p>}
                </div>
              </div>

              {/* Row 2: Company name */}
              <div className="flex flex-col gap-1.5">
                <div className="group relative">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/45 group-focus-within:text-[#6FA8A6] transition-colors">
                    <Building2 size={18} />
                  </div>
                  <input 
                    type="text" 
                    placeholder="Company name" 
                    className="w-full h-14 pl-14 pr-6 rounded-full border border-white/10 bg-white/[0.03] text-xs text-white placeholder:text-white/30 outline-none focus:border-[#6FA8A6]/50 focus:bg-white/[0.06] transition-all"
                    {...register("company_name")} 
                  />
                </div>
                {errors.company_name && <p className="px-4 text-[10px] font-medium text-red-400">{errors.company_name.message}</p>}
                {apiErrors?.company_name && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.company_name[0]}</p>}
              </div>

              {/* Row 3: Country & Team size */}
              <div className="grid gap-5 sm:grid-cols-2 text-black">
                <div className="flex flex-col gap-1.5">
                  <Controller
                    name="country"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        value={field.value}
                        onChange={field.onChange}
                        options={countriesToRender}
                        placeholder={isCountriesPending ? "Loading countries..." : "Select country"}
                        searchPlaceholder="Search countries..."
                        disabled={isCountriesPending || isCountriesError}
                        className="w-full h-14 px-6 rounded-full border border-white/10 bg-white/[0.03] text-xs text-white focus:border-[#6FA8A6]/50 outline-none transition-all cursor-pointer"
                      />
                    )}
                  />
                  {isCountriesError && (
                    <p className="px-4 text-[10px] font-medium text-red-400">
                      Unable to load countries. Please refresh.
                    </p>
                  )}
                  {errors.country && <p className="px-4 text-[10px] font-medium text-red-400">{errors.country.message}</p>}
                  {apiErrors?.country && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.country[0]}</p>}
                </div>

                <div className="flex flex-col gap-1.5 relative">
                  <select
                    className="w-full h-14 px-6 rounded-full border border-white/10 bg-white/[0.03] text-xs text-white focus:border-[#6FA8A6]/50 outline-none transition-all cursor-pointer appearance-none animate-none"
                    {...register("team_size")}
                  >
                    {teamSizeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value} className="text-[#0B252C]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-white/45">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                  {errors.team_size && <p className="px-4 text-[10px] font-medium text-red-400">{errors.team_size.message}</p>}
                  {apiErrors?.team_size && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.team_size[0]}</p>}
                </div>
              </div>

              {/* Row 4: Use case */}
              <div className="flex flex-col gap-1.5">
                <div className="group relative">
                  <div className="absolute left-6 top-6 text-white/45 group-focus-within:text-[#6FA8A6] transition-colors">
                    <MessageSquare size={18} />
                  </div>
                  <textarea
                    placeholder="Use case (what do you want to improve with Factory 23?)"
                    className="w-full min-h-[140px] pl-14 pr-6 py-5 rounded-[28px] border border-white/10 bg-white/[0.03] text-xs text-white placeholder:text-white/30 outline-none focus:border-[#6FA8A6]/50 focus:bg-white/[0.06] transition-all resize-none"
                    {...register("use_case")}
                  />
                </div>
                {errors.use_case && <p className="px-4 text-[10px] font-medium text-red-400">{errors.use_case.message}</p>}
                {apiErrors?.use_case && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.use_case[0]}</p>}
              </div>

              {/* Submit Button */}
              <button 
                type="submit" 
                className="w-full h-14 mt-2 rounded-full bg-[#6FA8A6] text-white text-xs font-bold tracking-widest uppercase hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[0px_4px_12px_rgba(111,168,166,0.25)]"
                disabled={requestMutation.isPending || isCountriesPending || isCountriesError}
              >
                {requestMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Processing...
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    SUBMIT REQUEST <ChevronRight size={18} />
                  </div>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Call For Help & Headphones Icon at Bottom-Right */}
        <div className="absolute bottom-12 right-12 flex items-center gap-3 z-10">
          <span className="text-white/60 text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Call For Help</span>
          <button className="flex h-12 w-12 items-center justify-center rounded-full bg-[#13323B] border border-white/10 text-white hover:bg-[#1A4550] transition-colors cursor-pointer shadow-lg">
            <Headphones size={20} />
          </button>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B252C]/95 px-6 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-md overflow-hidden rounded-[40px] border border-white/10 bg-white/[0.02] p-1 shadow-2xl">
            <div className="rounded-[36px] bg-gradient-to-b from-white/[0.05] to-transparent p-10 text-center text-white">
              <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#6FA8A6]/10 text-[#6FA8A6] border-4 border-[#6FA8A6]/20">
                <CheckCircle2 size={40} />
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white">Request Received</h2>
              <p className="mt-4 text-white/50 leading-relaxed text-sm">
                Your demo request for <span className="font-bold text-white">Factory 23</span> has been submitted successfully. Our enterprise team will review your application and reach out within 24 hours.
              </p>
              <div className="mt-10 flex flex-col gap-4">
                <button 
                  onClick={() => setShowSuccessModal(false)}
                  className="h-14 w-full rounded-2xl bg-[#6FA8A6] text-[#0A1618] hover:opacity-90 font-bold shadow-lg transition-all cursor-pointer text-sm"
                >
                  Return to Form
                </button>
                <Link href="/" className="w-full">
                  <button 
                    type="button" 
                    className="h-14 w-full rounded-2xl border border-white/20 bg-white/5 text-white hover:bg-white/10 font-bold transition-all cursor-pointer text-sm"
                  >
                    Go to Homepage
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
