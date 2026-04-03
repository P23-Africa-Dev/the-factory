"use client";

import GoogleLogo from "@/assets/images/google-logo.png";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();
  return (
    <div className="flex flex-col">
      <Input type="text" placeholder="Full Name" className="mb-9" />
      <Input type="email" placeholder="Email" className="md:mb-16 mb-6" />

      <div className="flex flex-col md:gap-3 gap-6 mt-2">
        <Button onClick={() => router.push("/complete-onboarding")}>Create Account</Button>
        <p className="text-center text-xs text-[#A9AAAB]">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-[#34373C] cursor-pointer hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      <div className="flex items-center gap-[10px] md:mt-16 mt-[18px] md:mb-[19px] mb-3.5 h-[38px]">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="text-xs text-[#A9AAAB]">Or</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <Button variant="outline" className="gap-3">
        <Image
          src={GoogleLogo}
          alt="Google Logo"
          width={31}
          height={31}
          className="object-contain"
        />
        Continue with Google
      </Button>
    </div>
  );
}
