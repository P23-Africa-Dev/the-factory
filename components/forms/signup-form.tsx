import GoogleLogo from "@/assets/images/google-logo.png";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import Image from "next/image";

export default function SignupForm() {
  return (
    <div className="flex flex-col">
      <Input type="text" placeholder="Full Name" className="mb-9" />
      <Input type="email" placeholder="Email" className="mb-16" />

      <div className="flex flex-col gap-3 mt-2">
        <Button>Create Account</Button>
        <p className="text-center text-xs text-[#A9AAAB]">
          Already have an account?{" "}
          <span className="font-bold text-[#34373C] cursor-pointer hover:underline">
            Sign in
          </span>
        </p>
      </div>

      <div className="flex items-center gap-[10px] mt-16 mb-[19px] h-[38px]">
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
