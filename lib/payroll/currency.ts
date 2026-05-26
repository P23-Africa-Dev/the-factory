export const PAYROLL_DEFAULT_CURRENCY = "USD";

function normalizeCurrency(currency?: string | null): string {
    const normalized = currency?.trim().toUpperCase();
    return normalized || PAYROLL_DEFAULT_CURRENCY;
}

export function resolvePayrollCurrency(preferredCurrency?: string | null): string {
    return normalizeCurrency(preferredCurrency);
}

export function formatPayrollMoney(amount: number, currency?: string | null): string {
    const resolvedCurrency = resolvePayrollCurrency(currency);
    const formatted = amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    if (resolvedCurrency === "USD") {
        return `$${formatted}`;
    }

    return `${resolvedCurrency} ${formatted}`;
}