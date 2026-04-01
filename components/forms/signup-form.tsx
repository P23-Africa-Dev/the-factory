import GoogleLogo from "@/assets/images/google-logo.png";
import Image from "next/image";

export default function SignupForm() {
  return (
    <div className="flex flex-col">
      <input
        type="text"
        placeholder="Full Name"
        className="w-full h-[60px] px-7 rounded-full border shadow-[0px_1px_2px_0px_#0000004D] border-gray-200 text-xs text-[#34373C] outline-none focus:border-[#A9AAAB] placeholder:text-[#A9AAAB] transition-colors mb-9"
      />
      <input
        type="email"
        placeholder="Email"
        className="w-full h-[60px] px-7 rounded-full border shadow-[0px_1px_2px_0px_#0000004D] border-gray-200 text-xs text-[#34373C] outline-none focus:border-[#A9AAAB] placeholder:text-[#A9AAAB] transition-colors mb-16"
      />

      <div className="flex flex-col gap-3 mt-2">
        <button className="w-full h-[51px] rounded-full bg-[#6FA8A6] shadow-[0px_1px_2px_0px_#0000004D] active:shadow-[0px_1px_3px_1px_#00000026] text-white text-xs font-medium hover:bg-[#5e9795] transition-colors cursor-pointer">
          Create Account
        </button>
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

      <button className="w-full h-[51px] shadow-[0px_1px_2px_0px_#0000004D,0px_1px_3px_1px_#00000026] rounded-full border border-gray-200 flex items-center justify-center gap-3 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
        <Image
          src={GoogleLogo}
          alt="Google Logo"
          width={31}
          height={31}
          className="object-contain"
        />
        Continue with Google
      </button>
    </div>
  );
}
