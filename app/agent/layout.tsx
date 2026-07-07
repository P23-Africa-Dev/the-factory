import { Navbar } from "@/components/layout/navbar";
import { AgentGuard } from "@/components/auth/agent-guard";
import { AgentTrackingShell } from "@/components/tracking/AgentTrackingShell";
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
    redirect("/agent/login");
  }

  const session = await getServerSessionState(token);

  if (!session.isAuthenticated) {
    redirect("/agent/login");
  }

  if (session.billingEnforced && !session.hasActiveSubscription) {
    redirect("/subscribe");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 overflow-auto">
        <AgentGuard>
          <AgentTrackingShell>{children}</AgentTrackingShell>
        </AgentGuard>
      </main>
      <FloatingAIButton />
    </div>
  );
}
