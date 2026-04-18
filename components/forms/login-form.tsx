"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginUser } from "@/lib/api/auth";
import { ApiRequestError, getMe } from "@/lib/api/onboarding";
import { setAuthSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";
import { toast } from "sonner";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const loginSchema = z.object({
  terms: z.boolean().refine((val) => val === true, "You must agree to the terms."),
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
  remember: z.boolean().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginForm() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [showPassword, setShowPassword] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      terms: false,
      email: "",
      password: "",
      remember: false,
    },
  });

  const terms = watch("terms");
  const email = watch("email");
  const password = watch("password");
  const isFilled = terms && email.trim() !== "" && password.trim() !== "";

  async function onSubmit(values: LoginFormValues) {
    setGlobalError("");
    setLoading(true);

    try {
      const res = await loginUser({ email: values.email, password: values.password });
      const token = res.data.token;
      setAuthSession(token, values.remember ?? true);

      const me = await getMe(token);
      setUser({
        id: me.data.id,
        name: me.data.name,
        email: me.data.email,
        avatar: me.data.avatar,
        user_type: res.data.user_type,
        access_role: res.data.access_role,
      });

      toast.success(res.message);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.errors) {
          if (err.errors.email) setError("email", { type: "server", message: err.errors.email[0] });
          if (err.errors.password) setError("password", { type: "server", message: err.errors.password[0] });
        } else {
          setGlobalError(err.message);
        }
        toast.error(err.message);
      } else {
        const msg = "An unexpected error occurred. Please try again.";
        setGlobalError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col" noValidate>
      <div className="flex items-start gap-4 mb-9 px-2 md:px-7">
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            type="checkbox"
            id="terms"
            {...register("terms")}
            className="peer w-5 h-5 shrink-0 appearance-none rounded-md border-[1.5px] border-[#A9AAAB] bg-white checked:bg-[#6FA8A6] checked:border-[#6FA8A6] cursor-pointer transition-colors"
          />
          <svg
            className="absolute text-white pointer-events-none opacity-0 peer-checked:opacity-100 w-3 h-3"
            viewBox="0 0 10 8"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M1 4L3.5 6.5L9 1"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="flex flex-col">
          <label
            htmlFor="terms"
            className="text-[13px] md:text-sm text-[#A9AAAB] leading-5.5 cursor-pointer"
          >
            By using Factory 23, you agree to our{" "}
            <Link
              href="#"
              className="text-[#6FA8A6] font-bold underline decoration-[#6FA8A6] underline-offset-2 hover:text-[#5e9795] transition-colors"
            >
              Terms, conditions and Privacy Policy.
            </Link>
          </label>
          {errors.terms && (
            <p className="mt-1 px-1 text-xs text-red-500">{errors.terms.message}</p>
          )}
        </div>
      </div>

      <div className="mb-6">
        <Input
          type="email"
          placeholder="Email"
          {...register("email")}
        />
        {errors.email && (
          <p className="mt-1.5 px-1 text-xs text-red-500">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="relative mb-6">
        <Input
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          className="w-full pr-12"
          {...register("password")}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-6 top-1/2 -translate-y-1/2 text-[#A9AAAB] hover:text-[#34373C] transition-colors focus:outline-none"
          tabIndex={-1}
        >
          {showPassword ? (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 10a13.35 13.35 0 0 0 9 4 13.35 13.35 0 0 0 9-4" />
              <path d="M12 14v4" />
              <path d="M8.5 13.5l-2 3" />
              <path d="M15.5 13.5l2 3" />
            </svg>
          )}
        </button>
        {errors.password && (
          <p className="mt-1.5 px-1 text-xs text-red-500">
            {errors.password.message}
          </p>
        )}
      </div>

      {globalError && (
        <p className="mb-4 px-1 text-sm text-red-500 text-center">
          {globalError}
        </p>
      )}

      <div className="flex items-center justify-between mb-16 px-2 md:px-7">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              id="remember"
              {...register("remember")}
              className="peer w-5 h-5 shrink-0 appearance-none rounded-md border-[1.5px] border-[#A9AAAB] bg-white checked:bg-[#6FA8A6] checked:border-[#6FA8A6] cursor-pointer transition-colors"
            />
            <svg
              className="absolute text-white pointer-events-none opacity-0 peer-checked:opacity-100 w-3 h-3"
              viewBox="0 0 10 8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1 4L3.5 6.5L9 1"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <label
            htmlFor="remember"
            className="text-sm text-[#A9AAAB] cursor-pointer"
          >
            Remember Me
          </label>
        </div>
        <Link
          href="/forgot-password"
          className="text-sm font-bold text-[#34373C] hover:underline"
        >
          Forgot Password?
        </Link>
      </div>

      <Button type="submit" disabled={!isFilled || loading}>
        {loading ? "Logging in…" : "Log In"}
      </Button>

      <p className="text-center text-xs mt-4 text-[#A9AAAB]">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-bold text-[#34373C] cursor-pointer hover:underline"
        >
          Contact Us.
        </Link>
      </p>
    </form>
  );
}
