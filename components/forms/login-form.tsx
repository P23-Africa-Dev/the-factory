"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginUser } from "@/lib/api/auth";
import { ApiRequestError } from "@/lib/api/onboarding";
import { setAuthSession } from "@/lib/auth/session";

export default function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [globalError, setGlobalError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setGlobalError("");
    setLoading(true);

    try {
      const res = await loginUser({ email, password });
      setAuthSession(res.data.token, true);
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.errors) {
          setFieldErrors(err.errors);
        } else {
          setGlobalError(err.message);
        }
      } else {
        setGlobalError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col" noValidate>
      <div className="flex items-start gap-4 mb-9 px-2 md:px-7">
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            type="checkbox"
            id="terms"
            className="peer w-[20px] h-[20px] shrink-0 appearance-none rounded-[6px] border-[1.5px] border-[#A9AAAB] bg-white checked:bg-[#6FA8A6] checked:border-[#6FA8A6] cursor-pointer transition-colors"
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
      </div>

      <Input type="text" placeholder="Company ID" className="mb-6" />

      <div className="mb-6">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {fieldErrors.email && (
          <p className="mt-1.5 px-1 text-xs text-red-500">
            {fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="relative mb-6">
        <Input
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          className="w-full pr-12"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
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
        {fieldErrors.password && (
          <p className="mt-1.5 px-1 text-xs text-red-500">
            {fieldErrors.password[0]}
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
              className="peer w-[20px] h-[20px] shrink-0 appearance-none rounded-[6px] border-[1.5px] border-[#A9AAAB] bg-white checked:bg-[#6FA8A6] checked:border-[#6FA8A6] cursor-pointer transition-colors"
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

      <Button type="submit" disabled={loading}>
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
