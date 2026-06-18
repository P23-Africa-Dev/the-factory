const AGENT_PALETTE = {
  markerBorder: '#0EA5E9',
  markerHalo: 'rgba(14, 165, 233, 0.35)',
  markerFill: '#E0F2FE',
  markerText: '#0C4A6E',
} as const;

const DESTINATION_COLORS = {
  place: '#DC2626',
  task: '#1D7293',
  arrived: '#16A34A',
} as const;

export function getAgentInitials(name: string | null | undefined): string | null {
  const cleaned = String(name ?? '').trim();
  if (!cleaned) return null;

  const parts = cleaned
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();

  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase();
}

export type DestinationMarkerKind = 'task' | 'place';

export function createDestinationMarkerElement(input: {
  kind: DestinationMarkerKind;
  arrived?: boolean;
}): HTMLDivElement {
  const root = document.createElement('div');
  root.dataset.marker = 'destination';
  root.style.pointerEvents = 'none';

  const color = input.arrived
    ? DESTINATION_COLORS.arrived
    : input.kind === 'task'
      ? DESTINATION_COLORS.task
      : DESTINATION_COLORS.place;

  const innerIcon =
    input.kind === 'task'
      ? `<img src="/assets/task-icon.png" alt="" width="14" height="14" style="object-fit:contain;display:block;" />`
      : '';

  root.innerHTML = `
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
      <svg width="36" height="46" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0px 6px 10px rgba(0,0,0,0.25));">
        <path d="M12 0C5.37258 0 0 5.37258 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37258 18.6274 0 12 0Z" fill="${color}"/>
        <circle cx="12" cy="12" r="6" fill="white"/>
      </svg>
      <div style="position:absolute;top:6px;left:50%;transform:translateX(-50%);width:14px;height:14px;display:flex;align-items:center;justify-content:center;">
        ${innerIcon}
      </div>
    </div>
  `;

  return root;
}

export function createAgentMarkerElement(input: {
  displayName: string;
  avatarUrl?: string | null;
  preferInitials?: boolean;
}): HTMLDivElement {
  const root = document.createElement('div');
  root.dataset.marker = 'agent';
  root.style.position = 'relative';
  root.style.width = '44px';
  root.style.height = '44px';
  root.style.borderRadius = '9999px';
  root.style.display = 'flex';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';
  root.style.userSelect = 'none';

  const halo = document.createElement('span');
  halo.dataset.part = 'halo';
  halo.style.position = 'absolute';
  halo.style.inset = '-5px';
  halo.style.borderRadius = '9999px';
  halo.style.pointerEvents = 'none';
  halo.style.background = AGENT_PALETTE.markerHalo;

  const shell = document.createElement('span');
  shell.dataset.part = 'shell';
  shell.style.position = 'relative';
  shell.style.width = '100%';
  shell.style.height = '100%';
  shell.style.borderRadius = '9999px';
  shell.style.overflow = 'hidden';
  shell.style.display = 'flex';
  shell.style.alignItems = 'center';
  shell.style.justifyContent = 'center';
  shell.style.fontSize = '12px';
  shell.style.fontWeight = '700';
  shell.style.textTransform = 'uppercase';
  shell.style.border = `3px solid ${AGENT_PALETTE.markerBorder}`;
  shell.style.background = AGENT_PALETTE.markerFill;
  shell.style.color = AGENT_PALETTE.markerText;
  shell.style.boxShadow = '0 8px 16px rgba(15, 23, 42, 0.24)';

  const img = document.createElement('img');
  img.dataset.part = 'avatar';
  img.style.width = '100%';
  img.style.height = '100%';
  img.style.objectFit = 'cover';
  img.style.display = 'none';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';

  const initials = document.createElement('span');
  initials.dataset.part = 'initials';

  shell.appendChild(img);
  shell.appendChild(initials);
  root.appendChild(halo);
  root.appendChild(shell);

  updateAgentMarkerElement(root, input);
  return root;
}

export function updateAgentMarkerElement(
  root: HTMLElement,
  input: {
    displayName: string;
    avatarUrl?: string | null;
    preferInitials?: boolean;
  },
): void {
  const shell = root.querySelector<HTMLElement>('[data-part="shell"]');
  const img = root.querySelector<HTMLImageElement>('[data-part="avatar"]');
  const initials = root.querySelector<HTMLElement>('[data-part="initials"]');

  if (!shell || !img || !initials) return;

  const initialsLabel = getAgentInitials(input.displayName);
  initials.textContent = initialsLabel ?? 'A';

  const applyFallback = () => {
    img.style.display = 'none';
    initials.style.display = 'flex';
    initials.style.alignItems = 'center';
    initials.style.justifyContent = 'center';
    initials.style.width = '100%';
    initials.style.height = '100%';
  };

  const shouldUseInitials = input.preferInitials || !input.avatarUrl;

  if (shouldUseInitials) {
    img.removeAttribute('src');
    applyFallback();
    return;
  }

  img.alt = `${input.displayName || 'Agent'} avatar`;
  img.onerror = () => applyFallback();
  img.onload = () => {
    img.style.display = 'block';
    initials.style.display = 'none';
  };

  if (img.getAttribute('src') !== input.avatarUrl) {
    img.setAttribute('src', input.avatarUrl!);
  }

  if (img.complete && img.naturalWidth > 0) {
    img.style.display = 'block';
    initials.style.display = 'none';
    return;
  }

  applyFallback();
}
