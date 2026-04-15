import { Navbar } from "@/components/layout/navbar";
import { AUTH_TOKEN_COOKIE, ONBOARDING_DONE_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
  const onboardingDone = cookieStore.get(ONBOARDING_DONE_COOKIE)?.value === "1";

  // if (!token) {
  //   redirect("/register");
  // }

  // if (!onboardingDone) {
  //   redirect("/complete-onboarding");
  // }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
