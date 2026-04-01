import OnboardingForm from "@/components/forms/onboarding-form";

export default function CompleteOnboardingPage() {
  return (
    <div className="w-full max-w-[460px] flex flex-col gap-8 md:mt-0 lg:-mt-12">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 className="text-[32px] sm:text-[36px] font-extrabold leading-10 tracking-[0px] text-[#34373C] mb-2.5">
          Welcome (Fullname)
        </h2>
        <p className="text-gray-500 text-sm tracking-[0px] leading-[22px] max-w-[400px] md:mx-auto">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna
        </p>
      </div>

      <OnboardingForm />
    </div>
  );
}
