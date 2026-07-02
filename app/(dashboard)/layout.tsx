import { Navbar } from "@/components/layout/navbar";
import { AdminGuard } from "@/components/auth/admin-guard";
import { FloatingAIButton } from "@/components/layout/floating-ai-button";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

async function getUserAccess(token: string): Promise<{
  onboardingCompleted: boolean;
  hasActiveSubscription: boolean;
  billingEnforced: boolean;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/user/me`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        onboardingCompleted: false,
        hasActiveSubscription: false,
        billingEnforced: true,
      };
    }

    const payload = await response.json();
    const data = payload?.data ?? {};
    const billing = data?.billing ?? {};
    const activeCompany = data?.active_company ?? {};

    return {
      onboardingCompleted: Boolean(data?.onboarding_completed),
      hasActiveSubscription: Boolean(
        billing?.has_active_subscription ?? activeCompany?.has_active_subscription
      ),
      billingEnforced: Boolean(
        billing?.billing_enforced ?? activeCompany?.billing_enforced ?? true
      ),
    };
  } catch {
    return {
      onboardingCompleted: false,
      hasActiveSubscription: false,
      billingEnforced: true,
    };
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_TOKEN_COOKIE)?.value;

  if (!token) {
    redirect("/login");
  }

  const { onboardingCompleted, hasActiveSubscription, billingEnforced } =
    await getUserAccess(token);

  if (!onboardingCompleted) {
    redirect("/complete-onboarding");
  }

  if (billingEnforced && !hasActiveSubscription) {
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
