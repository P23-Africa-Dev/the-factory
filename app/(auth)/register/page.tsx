import SignupForm from "@/components/forms/signup-form";

export default function RegisterPage() {
  return (
    <div className="w-full max-w-[460px] flex flex-col gap-8">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 className="text-[32px] font-extrabold leading-10 tracking-[0px] text-gray-900 mb-2.5">
          Let{"\u2019"}s Create your Account
        </h2>
        <p className="text-gray-500 text-sm tracking-[0px] leading-[16px] max-w-[380px] md:mx-auto">
          Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do
          eiusmod tempor
        </p>
      </div>

      <SignupForm />
    </div>
  );
}
