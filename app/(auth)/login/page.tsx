import LoginForm from "@/components/forms/login-form";

export default function LoginPage() {
  return (
    <div className="w-full max-w-[460px] flex flex-col gap-8">
      <div className="text-left md:text-center flex flex-col gap-3">
        <h2 className="text-[32px] font-extrabold leading-10 tracking-[0px] text-gray-900 mb-2.5">
          Login to Continue
        </h2>
      </div>

      <LoginForm />
    </div>
  );
}
