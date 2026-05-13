import ForgotPasswordForm from "@/components/forms/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-[460px] flex flex-col gap-8 md:mt-0 lg:-mt-12">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 className="text-[32px] sm:text-[36px] font-extrabold leading-10 tracking-[0px] text-[#34373C] mb-2.5">
          Forgot Password
        </h2>
        <p className="text-gray-500 text-sm tracking-[0px] leading-[22px] max-w-[380px] md:mx-auto">
          Enter your registered email address to receive instructions on how to reset your password.
        </p>
      </div>

      <ForgotPasswordForm />
    </div>
  );
}
