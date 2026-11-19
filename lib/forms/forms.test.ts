import { afterEach, describe, expect, it, vi } from "vitest";

import { mapApiFieldErrors } from "@/lib/forms/api-field-errors";
import { scrollToFirstError } from "@/lib/forms/scroll-to-first-error";

describe("mapApiFieldErrors", () => {
  it("maps Laravel 422 keys to form keys and keeps the first message", () => {
    const err = { errors: { full_name: ["Name is required.", "Too short."], base_salary: ["Bad salary."], "contacts.0.email": ["Bad email."] } };
    expect(mapApiFieldErrors(err, { full_name: "name", base_salary: "salary" })).toEqual({
      name: "Name is required.",
      salary: "Bad salary.",
      "contacts.0.email": "Bad email.",
    });
  });

  it("returns an empty object for non-validation errors", () => {
    expect(mapApiFieldErrors(new Error("boom"))).toEqual({});
    expect(mapApiFieldErrors(null)).toEqual({});
  });
});

describe("scrollToFirstError", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("scrolls to the first field with an error and focuses its input", async () => {
    document.body.innerHTML = `
      <form>
        <div data-field><input id="ok" /></div>
        <div data-field><input id="email" /><p data-field-error>Email is invalid.</p></div>
        <div data-field><input id="phone" /><p data-field-error>Phone is invalid.</p></div>
      </form>`;
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    await expect(scrollToFirstError()).resolves.toBe(true);

    expect(document.activeElement?.id).toBe("email");
    expect(scrollSpy).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });

  it("works without scrollIntoView (older browsers / jsdom) and when there is no error", async () => {
    // @ts-expect-error simulate an environment without scrollIntoView
    delete Element.prototype.scrollIntoView;
    document.body.innerHTML = `<div><input id="name" aria-invalid="true" /></div>`;
    await expect(scrollToFirstError()).resolves.toBe(true);
    expect(document.activeElement?.id).toBe("name");

    document.body.innerHTML = `<div><input id="fine" /></div>`;
    await expect(scrollToFirstError()).resolves.toBe(false);
  });
});
