import SignupForm from "@/components/forms/signup-form";

export default function RegisterPage() {
  return (
    <div className="w-full max-w-[460px] flex flex-col gap-8">
      <div className="text-left w-[226px] md:w-full md:text-center mx-[27px] md:mx-0 flex flex-col gap-3">
        <h2 className="text-[32px] font-extrabold leading-10 tracking-[0px] text-gray-900 md:mb-2.5 mb-[18px]">
          Let{"\u2019"}s Create your Account
        </h2>
        <p className="text-gray-500 text-sm tracking-[0px] leading-[16px] max-w-[380px] md:mx-auto">
          Sign up to get started and manage your workspace with ease.
        </p>
      </div>

      <SignupForm />
    </div>
  );
}
