import { Navbar } from "@/components/layout/navbar";
import { AdminGuard } from "@/components/auth/admin-guard";
import { FloatingAIButton } from "@/components/layout/floating-ai-button";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth/session";
import { getServerSessionState } from "@/lib/auth/server-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

  const session = await getServerSessionState(token);

  if (!session.isAuthenticated) {
    redirect("/login");
  }

  if (!session.onboardingCompleted) {
    redirect("/complete-onboarding");
  }

  if (session.billingEnforced && !session.hasActiveSubscription) {
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
