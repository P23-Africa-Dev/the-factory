"use client";

import { useState, useEffect } from "react";
import OtpInput from "@/components/ui/otp-input";
import Button from "@/components/ui/button";

export default function OtpForm() {
  const [otp, setOtp] = useState("");
  const [timeLeft, setTimeLeft] = useState(20 * 60);

  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const minutes = Math.floor(timeLeft / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (timeLeft % 60).toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs text-gray-400 mb-[9px]">Enter the 6-digit OTP here!</p>

      <OtpInput value={otp} onChange={setOtp} />

      <p className="text-xs text-gray-400 mt-[15px] mb-10">
        {minutes}:{seconds} mins
      </p>

      <div className="flex flex-col md:gap-3 gap-3 mt-2 w-full px-[27px] md:px-0">
        <Button>Verify</Button>
        <p className="text-center text-xs text-[#A9AAAB]">
          Already have an account?{" "}
          <span className="font-bold text-[#34373C] cursor-pointer hover:underline">
            Sign in
          </span>
        </p>
      </div>
    </div>
  );
}
