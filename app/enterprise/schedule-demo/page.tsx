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
  Phone,
  Building2,
  Globe,
  MessageSquare,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Headphones,
  ChevronLeft,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, addDays, isBefore, startOfDay } from "date-fns";
import Logo from "@/assets/images/logo.png";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import PhoneNumberInput from "@/components/ui/phone-number-input";
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
  phone: z
    .string()
    .regex(/^\+[1-9][0-9]{7,14}$/, "Use a valid international number (e.g. +2348012345678)."),
  company_name: z.string().min(2, "Company name must be at least 2 characters."),
  country: z.string().min(2, "Please select a country."),
  team_size: z.enum(["2-10", "11-50", "51-200", "201-500", "501+"]),
  use_case: z.string().min(10, "Use case should be at least 10 characters."),
  scheduled_date: z.string().optional(),
  scheduled_time: z.string().optional(),
});

const teamSizeOptions: { label: string; value: TeamSizeRange }[] = [
  { label: "2-10", value: "2-10" },
  { label: "11-50", value: "11-50" },
  { label: "51-200", value: "51-200" },
  { label: "201-500", value: "201-500" },
  { label: "501+", value: "501+" },
];

const enterpriseInputClassName =
  "bg-white/5 border-white/5 pl-14 text-white placeholder:text-white/20 focus:border-[#6FA8A6]/50 focus:bg-white/[0.08]";

const enterprisePhoneClassName =
  "bg-white/5 border-white/5 pl-14 pr-7 text-white placeholder:text-white/20 focus-within:border-[#6FA8A6]/50 focus-within:bg-white/[0.08]";

const selectTriggerClassName =
  "w-full h-[60px] pl-14 pr-7 rounded-full border shadow-[0px_1px_2px_0px_#0000004D] border-white/5 bg-white/5 text-xs text-white outline-none focus:border-[#6FA8A6]/50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60";

export default function ScheduleDemoPage() {
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedHour, setSelectedHour] = useState("06");
  const [selectedMinute, setSelectedMinute] = useState("27");
  const [selectedSecond, setSelectedSecond] = useState("54");
  const [timeZone, setTimeZone] = useState("GMT");
  const [amPm, setAmPm] = useState("PM");

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

  const {
    register,
    control,
    handleSubmit,
    trigger,
    reset,
    getValues,
    formState: { errors },
  } = useForm<DemoRequestPayload>({
    resolver: zodResolver(scheduleDemoSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
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

  const getPrev = (val: string, max: number, min: number = 0) => {
    let v = parseInt(val, 10) - 1;
    if (v < min) v = max;
    return v.toString().padStart(2, "0");
  };

  const getNext = (val: string, max: number, min: number = 0) => {
    let v = parseInt(val, 10) + 1;
    if (v > max) v = min;
    return v.toString().padStart(2, "0");
  };

  const handleNextStep = async (e: React.MouseEvent) => {
    e.preventDefault();
    const isValid = await trigger();
    if (isValid) {
      setStep(2);
    }
  };

  const handleFinalSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedDate) {
      toast.error("Please select a date for your demo.");
      return;
    }
    const values = getValues();
    const formattedDate = format(selectedDate, "EEE, dd MMMM yyyy");
    const formattedTime = `${selectedHour}:${selectedMinute}:${selectedSecond} ${amPm} ${timeZone}`;
    
    requestMutation.mutate({
      ...values,
      scheduled_date: formattedDate,
      scheduled_time: formattedTime,
    });
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const dateFormat = "d";
    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";
    const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, dateFormat);
        const cloneDay = day;
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isSelected = selectedDate && isSameDay(day, selectedDate);
        const isPast = isBefore(day, startOfDay(new Date()));

        days.push(
          <div
            key={day.toString()}
            onClick={() => {
              if (isCurrentMonth && !isPast) {
                setSelectedDate(cloneDay);
              }
            }}
            className={`h-9 w-10 flex items-center justify-center rounded-[6px] text-[13px] font-medium transition-all ${
              !isCurrentMonth
                ? "text-transparent pointer-events-none"
                : isSelected
                ? "bg-[#9BDD7C] text-[#0B252C] shadow-sm cursor-pointer"
                : isPast
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-[#163B45] text-white hover:bg-white/20 cursor-pointer"
            }`}
          >
            {formattedDate}
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-2 sm:gap-4 justify-items-center w-full" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }

    return (
      <div className="flex flex-col items-center w-full max-w-[420px] mx-auto">
        <div className="flex justify-between items-center w-full mb-6 text-white">
          <span className="text-sm font-medium text-white/90">Select Day</span>
        </div>
        <div className="flex justify-between items-center w-full mb-8">
          <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="text-white/60 hover:text-white transition-colors cursor-pointer p-2 -ml-2">
            <ChevronLeft size={20} />
          </button>
          <span className="text-xl font-medium text-white">
            {format(currentMonth, "MMMM yyyy")}
          </span>
          <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="text-white/60 hover:text-white transition-colors cursor-pointer p-2 -mr-2">
            <ChevronRight size={20} />
          </button>
        </div>
        
        <div className="grid grid-cols-7 gap-2 sm:gap-4 justify-items-center w-full mb-4">
          {weekDays.map((d) => (
            <div key={d} className="text-[11px] font-medium text-white/50 tracking-wider h-8 flex items-center">
              {d}
            </div>
          ))}
        </div>
        
        <div className="flex flex-col gap-2 sm:gap-3 w-full">
          {rows}
        </div>
      </div>
    );
  };

  const renderTimePicker = () => {
    return (
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 items-start w-full max-w-[650px] mx-auto mt-12">
        <div className="bg-black/20 border border-white/5 rounded-[16px] p-6 w-full max-w-[340px] backdrop-blur-md">
          <div className="flex justify-between items-center mb-6">
            <span className="text-sm font-bold text-white">Set time</span>
            <div className="relative">
              <select 
                value={timeZone}
                onChange={(e) => setTimeZone(e.target.value)}
                className="appearance-none bg-transparent border border-white/20 rounded-md text-white text-[13px] font-bold px-3 py-1.5 pr-8 outline-none cursor-pointer hover:border-white/40 transition-colors"
              >
                <option value="GMT">GMT</option>
                <option value="EST">EST</option>
                <option value="PST">PST</option>
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-white/70">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-0 w-full text-white relative mt-4 px-2">
            <div className="flex items-center gap-6 px-4 text-white/40 text-[13px] font-medium pb-3 select-none">
              <div onClick={() => setSelectedHour(getPrev(selectedHour, 12, 1))} className="w-8 text-center cursor-pointer hover:text-white/60">{getPrev(selectedHour, 12, 1)}</div>
              <div className="w-1 text-transparent text-lg">:</div>
              <div onClick={() => setSelectedMinute(getPrev(selectedMinute, 59))} className="w-8 text-center cursor-pointer hover:text-white/60">{getPrev(selectedMinute, 59)}</div>
              <div className="w-1 text-transparent text-lg">:</div>
              <div onClick={() => setSelectedSecond(getPrev(selectedSecond, 59))} className="w-8 text-center cursor-pointer hover:text-white/60">{getPrev(selectedSecond, 59)}</div>
              <div className="w-8 ml-auto"></div>
            </div>
            
            <div className="w-full h-px bg-white/10" />

            <div className="flex items-center gap-6 px-4 text-white text-[16px] font-bold py-4 select-none">
              <div className="w-8 text-center">{selectedHour}</div>
              <div className="w-1 text-center text-white/50 text-lg -mt-1">:</div>
              <div className="w-8 text-center">{selectedMinute}</div>
              <div className="w-1 text-center text-white/50 text-lg -mt-1">:</div>
              <div className="w-8 text-center">{selectedSecond}</div>
              <div className="w-8 ml-auto text-center text-[15px]">{amPm}</div>
            </div>

            <div className="w-full h-px bg-white/10" />

            <div className="flex items-center gap-6 px-4 text-white/40 text-[13px] font-medium pt-3 select-none">
              <div onClick={() => setSelectedHour(getNext(selectedHour, 12, 1))} className="w-8 text-center cursor-pointer hover:text-white/60">{getNext(selectedHour, 12, 1)}</div>
              <div className="w-1 text-transparent text-lg">:</div>
              <div onClick={() => setSelectedMinute(getNext(selectedMinute, 59))} className="w-8 text-center cursor-pointer hover:text-white/60">{getNext(selectedMinute, 59)}</div>
              <div className="w-1 text-transparent text-lg">:</div>
              <div onClick={() => setSelectedSecond(getNext(selectedSecond, 59))} className="w-8 text-center cursor-pointer hover:text-white/60">{getNext(selectedSecond, 59)}</div>
              <div onClick={() => setAmPm(amPm === "AM" ? "PM" : "AM")} className="w-8 ml-auto text-center cursor-pointer hover:text-white/60">{amPm === "AM" ? "PM" : "AM"}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center h-full">
           <div className="mb-6">
             <div className="text-white font-bold text-[13px] mb-1.5">Selected Date:</div>
             <div className="text-white/60 text-[13px]">
               {selectedDate ? format(selectedDate, "EEE, dd MMMM yyyy") : "No date selected"}
             </div>
           </div>
           <div>
             <div className="text-white font-bold text-[13px] mb-1.5">Selected Time:</div>
             <div className="text-white/60 text-[13px] uppercase">
               {selectedHour}:{selectedMinute}:{selectedSecond} {amPm} {timeZone}
             </div>
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white font-sans overflow-x-hidden relative">
      <div className="w-full lg:w-[46%] bg-white flex flex-col justify-between p-6 sm:p-10 lg:p-16 lg:min-h-screen relative bg-[radial-gradient(#e5e7eb_1.5px,transparent_1.5px)] [background-size:24px_24px]">

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

        <main className="my-auto py-16 lg:py-0 flex flex-col justify-center max-w-md relative z-10">
          <Link
            href="/"
            className="group inline-flex items-center gap-2 text-sm font-bold text-[#0B252C]/60 hover:text-[#0B252C] transition-colors mb-8"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-1" />
            Back to Home
          </Link>

          {step === 1 ? (
            <>
              <h1 className="text-5xl lg:text-[64px] font-extrabold text-[#0B252C] leading-[1.1] tracking-[-0.02em] mb-6">
                Request <br />
                Your Demo
              </h1>
              <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed max-w-sm">
                Request a Demo for Factory 23 and one of our representatives will <span className="font-bold uppercase">GET IN TOUCH</span> with You
              </p>
            </>
          ) : (
            <>
              <h1 className="text-5xl lg:text-[64px] font-extrabold text-[#0B252C] leading-[1.1] tracking-[-0.02em] mb-6">
                Schedule <br />
                Your Demo
              </h1>
              <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed max-w-sm">
                Pick a convenient date and time for your demo. You&apos;ll receive a confirmation email once it&apos;s booked.
              </p>
            </>
          )}
        </main>

        <div className="absolute bottom-0 left-0 flex items-center h-[120px] w-full z-20 pointer-events-none">
          <div className="h-full w-24 lg:w-48 bg-[#9BDD7C] rounded-tr-[100px] pointer-events-auto" />
          <div className="relative -ml-8 lg:-ml-12 pointer-events-auto">
            {step === 1 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="h-[52px] px-8 bg-[#0B252C] text-white text-[13px] font-medium rounded-[10px] flex items-center justify-center gap-3 hover:bg-[#13323B] transition-all cursor-pointer shadow-lg"
              >
                Next <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={requestMutation.isPending}
                className="h-[52px] px-8 bg-[#0B252C] text-white text-[13px] font-medium rounded-[10px] flex items-center justify-center gap-3 hover:bg-[#13323B] transition-all cursor-pointer shadow-lg disabled:opacity-50"
              >
                {requestMutation.isPending ? "Processing..." : "Submit"} <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Pane */}
      <div className="w-full lg:w-[54%] bg-[#0B252C] flex flex-col justify-between p-6 sm:p-10 lg:p-16 relative lg:min-h-screen">

        <div className="flex items-center justify-between w-full z-10">
          <Link href="#" className="text-sm font-semibold text-white/90 hover:opacity-80 transition-opacity">
            P23 Africa
          </Link>

          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="px-6 h-12 border border-white/30 text-white text-xs font-semibold rounded-full flex items-center justify-center gap-2 hover:border-white/60 hover:bg-white/5 active:scale-[0.98] transition-all"
            >
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

        {/* Form or Calendar */}
        <div className="flex-1 flex flex-col items-center justify-center z-10 py-12 lg:py-0 w-full relative">
          {step === 1 ? (
            <div className="w-full max-w-[500px] bg-black/15 border border-white/10 rounded-[32px] p-6 sm:p-8 flex flex-col gap-6 shadow-[0px_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-md">
              <form className="flex flex-col gap-5">
              {/* Full name */}
              <div className="flex flex-col gap-1.5">
                <div className="group relative">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#6FA8A6] transition-colors z-10">
                    <User size={18} />
                  </div>
                  <Input
                    type="text"
                    placeholder="Full name"
                    className={enterpriseInputClassName}
                    {...register("full_name")}
                  />
                </div>
                {errors.full_name && <p className="px-4 text-[10px] font-medium text-red-400">{errors.full_name.message}</p>}
                {apiErrors?.full_name && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.full_name[0]}</p>}
              </div>

              {/* Phone */}
              <div className="flex flex-col gap-1.5">
                <div className="group relative">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#6FA8A6] transition-colors z-10">
                    <Phone size={18} />
                  </div>
                  <Controller
                    name="phone"
                    control={control}
                    render={({ field }) => (
                      <PhoneNumberInput
                        variant="enterprise"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Phone no."
                        className={enterprisePhoneClassName}
                      />
                    )}
                  />
                </div>
                {errors.phone && <p className="px-4 text-[10px] font-medium text-red-400">{errors.phone.message}</p>}
                {apiErrors?.phone && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.phone[0]}</p>}
              </div>

              {/* Work email */}
              <div className="flex flex-col gap-1.5">
                <div className="group relative">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#6FA8A6] transition-colors z-10">
                    <Mail size={18} />
                  </div>
                  <Input
                    type="email"
                    placeholder="Work email"
                    className={enterpriseInputClassName}
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="px-4 text-[10px] font-medium text-red-400">{errors.email.message}</p>}
                {apiErrors?.email && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.email[0]}</p>}
              </div>

              {/* Company name */}
              <div className="flex flex-col gap-1.5">
                <div className="group relative">
                  <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/40 group-focus-within:text-[#6FA8A6] transition-colors z-10">
                    <Building2 size={18} />
                  </div>
                  <Input
                    type="text"
                    placeholder="Company name"
                    className={enterpriseInputClassName}
                    {...register("company_name")}
                  />
                </div>
                {errors.company_name && <p className="px-4 text-[10px] font-medium text-red-400">{errors.company_name.message}</p>}
                {apiErrors?.company_name && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.company_name[0]}</p>}
              </div>

              {/* Country & Team size */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <div className="group relative">
                    <div className="pointer-events-none absolute left-6 top-1/2 z-10 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-[#6FA8A6]">
                      <Globe size={18} />
                    </div>
                    <Controller
                      name="country"
                      control={control}
                      render={({ field }) => (
                        <SearchableSelect
                          variant="enterprise"
                          value={field.value}
                          onChange={field.onChange}
                          options={countryOptions}
                          placeholder={isCountriesPending ? "Loading..." : "Select country"}
                          searchPlaceholder="Search countries..."
                          disabled={isCountriesPending || isCountriesError}
                          className={selectTriggerClassName}
                        />
                      )}
                    />
                  </div>
                  {isCountriesError && (
                    <p className="px-4 text-[10px] font-medium text-red-400">
                      Unable to load countries. Please refresh.
                    </p>
                  )}
                  {errors.country && <p className="px-4 text-[10px] font-medium text-red-400">{errors.country.message}</p>}
                  {apiErrors?.country && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.country[0]}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Controller
                    name="team_size"
                    control={control}
                    render={({ field }) => (
                      <SearchableSelect
                        variant="enterprise"
                        value={field.value}
                        onChange={field.onChange}
                        options={teamSizeOptions}
                        placeholder="Team size"
                        className={selectTriggerClassName}
                      />
                    )}
                  />
                  {errors.team_size && <p className="px-4 text-[10px] font-medium text-red-400">{errors.team_size.message}</p>}
                  {apiErrors?.team_size && <p className="px-4 text-[10px] font-medium text-red-400">{apiErrors.team_size[0]}</p>}
                </div>
              </div>

              {/* Use case */}
              <div className="flex flex-col gap-1.5">
                <div className="group relative">
                  <div className="absolute left-6 top-6 text-white/40 group-focus-within:text-[#6FA8A6] transition-colors">
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

              </form>
            </div>
          ) : (
            <div className="w-full flex flex-col items-center pb-12 pt-8">
               {renderCalendar()}
               {renderTimePicker()}
            </div>
          )}
        </div>

        {/* Call For Help */}
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
                <Button
                  onClick={() => setShowSuccessModal(false)}
                  className="h-14 w-full rounded-2xl bg-[#6FA8A6] text-[#0A1618] hover:opacity-90 font-bold shadow-lg transition-all cursor-pointer text-sm"
                >
                  Return to Form
                </Button>
                <Link href="/" className="w-full">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 w-full rounded-2xl border border-white/20 bg-white/5 text-white hover:bg-white/10 font-bold transition-all"
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
