"use client";

import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Link from "next/link";

export default function ForgotPasswordForm() {
  return (
    <div className="flex flex-col">
      <Input type="email" placeholder="Email Address" className="mb-8" />
      
      <Button>Send Reset Link</Button>
      
      <p className="text-center text-xs mt-6 text-[#A9AAAB]">
        Remember your password?{" "}
        <Link href="/login" className="font-bold text-[#34373C] cursor-pointer hover:underline">
          Log In.
        </Link>
      </p>
    </div>
  );
}
