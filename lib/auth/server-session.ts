const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

export type ServerSessionState = {
  isAuthenticated: boolean;
  onboardingCompleted: boolean;
  hasActiveSubscription: boolean;
  billingEnforced: boolean;
  role: string | null;
};

export async function getServerSessionState(
  token: string | null | undefined
): Promise<ServerSessionState> {
  if (!token) {
    return {
      isAuthenticated: false,
      onboardingCompleted: false,
      hasActiveSubscription: false,
      billingEnforced: true,
      role: null,
    };
  }

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
        isAuthenticated: false,
        onboardingCompleted: false,
        hasActiveSubscription: false,
        billingEnforced: true,
        role: null,
      };
    }

    const payload = await response.json();
    const data = payload?.data ?? {};
    const billing = data?.billing ?? {};
    const activeCompany = data?.active_company ?? {};

    return {
      isAuthenticated: true,
      onboardingCompleted: Boolean(data?.onboarding_completed),
      hasActiveSubscription: Boolean(
        billing?.has_active_subscription ?? activeCompany?.has_active_subscription
      ),
      billingEnforced: Boolean(
        billing?.billing_enforced ?? activeCompany?.billing_enforced ?? true
      ),
      role: typeof activeCompany?.role === "string" ? activeCompany.role : null,
    };
  } catch {
    return {
      isAuthenticated: false,
      onboardingCompleted: false,
      hasActiveSubscription: false,
      billingEnforced: true,
      role: null,
    };
  }
}
