import type { LiveTaskState } from "@/types/tracking";

export type VisualTaskState = "in_progress" | "near_destination" | "arrived" | "completed" | "stale";

type VisualPalette = {
    trail: string;
    connector: string;
    markerBorder: string;
    markerHalo: string;
    markerFill: string;
    markerText: string;
};

export const VISUAL_PALETTE: Record<VisualTaskState, VisualPalette> = {
    in_progress: {
        trail: "#0284C7",
        connector: "#38BDF8",
        markerBorder: "#0EA5E9",
        markerHalo: "rgba(14, 165, 233, 0.35)",
        markerFill: "#E0F2FE",
        markerText: "#0C4A6E",
    },
    near_destination: {
        trail: "#D97706",
        connector: "#F59E0B",
        markerBorder: "#D97706",
        markerHalo: "rgba(217, 119, 6, 0.35)",
        markerFill: "#FEF3C7",
        markerText: "#92400E",
    },
    arrived: {
        trail: "#16A34A",
        connector: "#22C55E",
        markerBorder: "#16A34A",
        markerHalo: "rgba(22, 163, 74, 0.35)",
        markerFill: "#DCFCE7",
        markerText: "#14532D",
    },
    completed: {
        trail: "#334155",
        connector: "#64748B",
        markerBorder: "#334155",
        markerHalo: "rgba(51, 65, 85, 0.35)",
        markerFill: "#E2E8F0",
        markerText: "#1E293B",
    },
    stale: {
        trail: "#94A3B8",
        connector: "#CBD5E1",
        markerBorder: "#6B7280",
        markerHalo: "rgba(107, 114, 128, 0.3)",
        markerFill: "#F3F4F6",
        markerText: "#4B5563",
    },
};

export const STATIC_MARKER_COLORS = {
    origin: {
        fill: "#2563EB",
        border: "#FFFFFF",
    },
    destination: {
        fill: "#DC2626",
        border: "#FFFFFF",
    },
    near: {
        fill: "#D97706",
        border: "#FFFFFF",
    },
    arrived: {
        fill: "#16A34A",
        border: "#FFFFFF",
    },
    completed: {
        fill: "#334155",
        border: "#FFFFFF",
    },
} as const;

const EPSILON = 1e-6;

export function getAgentInitials(name: string | null | undefined): string | null {
    const cleaned = String(name ?? "").trim();
    if (!cleaned) return null;

    const parts = cleaned
        .split(/\s+/)
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length === 0) return null;

    if (parts.length === 1) {
        return parts[0].slice(0, 1).toUpperCase();
    }

    return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

function isFiniteCoordinate(point: [number, number] | null | undefined): point is [number, number] {
    if (!point) return false;
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        return false;
    }

    // Ignore default/uninitialized map coordinates.
    if (point[0] === 0 && point[1] === 0) {
        return false;
    }

    return true;
}

export function areSamePoint(a: [number, number], b: [number, number], epsilon = EPSILON): boolean {
    return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

export function sanitizePolyline(points: [number, number][]): [number, number][] {
    const sanitized: [number, number][] = [];

    for (const point of points) {
        if (!isFiniteCoordinate(point)) continue;

        const previous = sanitized[sanitized.length - 1];
        if (previous && areSamePoint(previous, point)) continue;

        sanitized.push(point);
    }

    return sanitized;
}

export function buildTaskTrail(task: LiveTaskState): [number, number][] {
    const baseTrail = sanitizePolyline(task.polyline ?? []);
    const current = isFiniteCoordinate(task.lastPosition) ? task.lastPosition : null;

    if (!current) {
        return baseTrail;
    }

    if (baseTrail.length === 0) {
        return [current];
    }

    const tail = baseTrail[baseTrail.length - 1];
    if (areSamePoint(tail, current)) {
        return baseTrail;
    }

    return [...baseTrail, current];
}

export function resolveVisualTaskState(
    status: LiveTaskState["status"],
    stale: boolean
): VisualTaskState {
    if (stale) return "stale";
    return status;
}

export function buildDirectionSegment(trail: [number, number][]): [number, number][] | null {
    if (trail.length < 2) return null;
    return [trail[trail.length - 2], trail[trail.length - 1]];
}

export function createStaticMarkerElement(kind: "origin" | "destination" | "near" | "arrived" | "completed") {
    const root = document.createElement("div");
    root.style.width = "24px";
    root.style.height = "24px";
    root.style.borderRadius = "9999px";
    root.style.border = `3px solid ${STATIC_MARKER_COLORS[kind].border}`;
    root.style.background = STATIC_MARKER_COLORS[kind].fill;
    root.style.boxShadow = "0 6px 14px rgba(15, 23, 42, 0.22)";
    root.style.display = "flex";
    root.style.alignItems = "center";
    root.style.justifyContent = "center";
    root.style.color = "#FFFFFF";
    root.style.fontWeight = "700";
    root.style.fontSize = "10px";
    root.style.userSelect = "none";

    root.textContent =
        kind === "origin"
            ? "O"
            : kind === "destination"
                ? "D"
                : kind === "near"
                    ? "N"
                    : kind === "arrived"
                        ? "A"
                        : "C";

    return root;
}

export function createAgentMarkerElement(input: {
    name: string;
    avatarUrl?: string;
    visualState: VisualTaskState;
    stale: boolean;
}) {
    const root = document.createElement("div");
    root.dataset.marker = "agent";
    root.style.position = "relative";
    root.style.width = "44px";
    root.style.height = "44px";
    root.style.borderRadius = "9999px";
    root.style.display = "flex";
    root.style.alignItems = "center";
    root.style.justifyContent = "center";
    root.style.cursor = "pointer";
    root.style.userSelect = "none";

    const halo = document.createElement("span");
    halo.dataset.part = "halo";
    halo.style.position = "absolute";
    halo.style.inset = "-5px";
    halo.style.borderRadius = "9999px";
    halo.style.pointerEvents = "none";

    const shell = document.createElement("span");
    shell.dataset.part = "shell";
    shell.style.position = "relative";
    shell.style.width = "100%";
    shell.style.height = "100%";
    shell.style.borderRadius = "9999px";
    shell.style.overflow = "hidden";
    shell.style.display = "flex";
    shell.style.alignItems = "center";
    shell.style.justifyContent = "center";
    shell.style.fontSize = "12px";
    shell.style.fontWeight = "700";
    shell.style.textTransform = "uppercase";

    const img = document.createElement("img");
    img.dataset.part = "avatar";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.display = "none";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";

    const initials = document.createElement("span");
    initials.dataset.part = "initials";

    const generic = document.createElement("span");
    generic.dataset.part = "generic";
    generic.textContent = "#";
    generic.style.display = "none";

    shell.appendChild(img);
    shell.appendChild(initials);
    shell.appendChild(generic);
    root.appendChild(halo);
    root.appendChild(shell);

    updateAgentMarkerElement(root, input);

    return root;
}

export function updateAgentMarkerElement(
    root: HTMLElement,
    input: {
        name: string;
        avatarUrl?: string;
        visualState: VisualTaskState;
        stale: boolean;
    }
) {
    const palette = VISUAL_PALETTE[input.visualState];
    const shell = root.querySelector<HTMLElement>("[data-part='shell']");
    const halo = root.querySelector<HTMLElement>("[data-part='halo']");
    const img = root.querySelector<HTMLImageElement>("[data-part='avatar']");
    const initials = root.querySelector<HTMLElement>("[data-part='initials']");
    const generic = root.querySelector<HTMLElement>("[data-part='generic']");

    if (!shell || !halo || !img || !initials || !generic) {
        return;
    }

    shell.style.border = `3px solid ${palette.markerBorder}`;
    shell.style.background = palette.markerFill;
    shell.style.color = palette.markerText;
    shell.style.boxShadow = "0 8px 16px rgba(15, 23, 42, 0.24)";

    halo.style.background = palette.markerHalo;
    halo.style.opacity = input.stale ? "0.45" : "1";

    const initialsLabel = getAgentInitials(input.name);
    initials.textContent = initialsLabel ?? "";

    const applyFallback = () => {
        img.style.display = "none";
        initials.style.display = initialsLabel ? "flex" : "none";
        generic.style.display = initialsLabel ? "none" : "flex";
        generic.style.alignItems = "center";
        generic.style.justifyContent = "center";
    };

    if (!input.avatarUrl) {
        img.removeAttribute("src");
        applyFallback();
        return;
    }

    img.alt = `${input.name || "Agent"} avatar`;
    img.onerror = () => {
        applyFallback();
    };
    img.onload = () => {
        img.style.display = "block";
        initials.style.display = "none";
        generic.style.display = "none";
    };

    if (img.getAttribute("src") !== input.avatarUrl) {
        img.setAttribute("src", input.avatarUrl);
    }

    if (img.complete && img.naturalWidth > 0) {
        img.style.display = "block";
        initials.style.display = "none";
        generic.style.display = "none";
        return;
    }

    applyFallback();
}
