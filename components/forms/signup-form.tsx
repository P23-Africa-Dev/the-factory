"use client";

import GoogleLogo from "@/assets/images/google-logo.png";
import { registerUser, type ApiRequestError } from "@/lib/api/onboarding";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2, "Full name must be at least 2 characters."),
  email: z.string().email("Please enter a valid email address."),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function SignupForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const registerMutation = useMutation({
    mutationFn: registerUser,
    onSuccess: (_, values) => {
      router.push(`/verify-otp?email=${encodeURIComponent(values.email)}`);
    },
  });

  const onSubmit = (values: RegisterFormValues) => {
    registerMutation.mutate(values);
  };

  const apiError = registerMutation.error as ApiRequestError | null;

  return (
    <form className="flex flex-col" onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="text"
        placeholder="Full Name"
        className="mb-2"
        {...register("name")}
      />
      {errors.name ? (
        <p className="text-xs text-red-500 mb-5 px-4">{errors.name.message}</p>
      ) : null}

      <Input
        type="email"
        placeholder="Email"
        className="mb-2"
        {...register("email")}
      />
      {errors.email ? (
        <p className="text-xs text-red-500 mb-5 px-4">{errors.email.message}</p>
      ) : (
        <div className="md:mb-8 mb-2" />
      )}

      {apiError ? (
        <p className="text-xs text-red-500 mb-4 px-4">{apiError.message}</p>
      ) : null}

      <div className="flex flex-col md:gap-3 gap-6 mt-2">
        <Button type="submit" disabled={registerMutation.isPending}>
          {registerMutation.isPending ? "Creating..." : "Create Account"}
        </Button>
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
    </form>
  );
}
