/**
 * Form error UX: after a failed submit (client validation or a 422 from the
 * API), bring the user to the first field with an error.
 *
 * Convention: every inline error message is rendered with a `data-field-error`
 * attribute (see components/ui/field-error.tsx). Optionally wrap a field and its
 * error in an element with `data-field` so the whole field is scrolled into view
 * and its input is focused. Inputs may also carry aria-invalid="true".
 *
 * Modals and drawers scroll an inner container, so we call scrollIntoView on the
 * field itself (it scrolls the nearest scrollable ancestor), never window.scrollTo.
 */

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function firstInvalidElement(root: ParentNode): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-field-error], [aria-invalid="true"]');
}

/** Resolve the field container for an error message or invalid input. */
function fieldFor(target: HTMLElement): HTMLElement {
  return (
    target.closest<HTMLElement>("[data-field]") ??
    (target.hasAttribute("data-field-error") ? target.parentElement : null) ??
    target
  );
}

function focusTarget(field: HTMLElement, invalid: HTMLElement): HTMLElement | null {
  if (invalid.matches(FOCUSABLE)) return invalid;
  const preferred = field.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (preferred && preferred.matches(FOCUSABLE)) return preferred;
  return field.querySelector<HTMLElement>(FOCUSABLE);
}

/**
 * Scroll to and focus the first invalid field inside `root` (defaults to the
 * document). Waits two animation frames so freshly set error state has rendered.
 * Returns a promise that resolves to whether an error was found.
 */
export function scrollToFirstError(root?: ParentNode | null): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  return new Promise((resolve) => {
    const raf = window.requestAnimationFrame ?? ((cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 16));
    raf(() =>
      raf(() => {
        const scope = root ?? document;
        const invalid = firstInvalidElement(scope);
        if (!invalid) {
          resolve(false);
          return;
        }

        const field = fieldFor(invalid);
        if (typeof field.scrollIntoView === "function") {
          field.scrollIntoView({ block: "center", behavior: "smooth" });
        }

        const target = focusTarget(field, invalid);
        try {
          target?.focus({ preventScroll: true });
        } catch {
          target?.focus();
        }
        resolve(true);
      }),
    );
  });
}
