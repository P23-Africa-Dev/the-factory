import { Navbar } from "@/components/layout/navbar";
import { AdminGuard } from "@/components/auth/admin-guard";
import { FloatingAIButton } from "@/components/layout/floating-ai-button";
import { AUTH_TOKEN_COOKIE, ONBOARDING_DONE_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

async function hasActiveSubscription(token: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/billing/status`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const payload = await response.json();

    return Boolean(payload?.data?.has_active_subscription);
  } catch {
    return false;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;
  const onboardingDone = cookieStore.get(ONBOARDING_DONE_COOKIE)?.value === "1";

  if (!token) {
    redirect("/login");
  }

  if (!onboardingDone) {
    redirect("/complete-onboarding");
  }

  const subscribed = await hasActiveSubscription(token);

  if (!subscribed) {
    redirect("/subscribe");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 overflow-auto">
        <AdminGuard>{children}</AdminGuard>
      </main>
      <FloatingAIButton />
    </div>
  );
}
