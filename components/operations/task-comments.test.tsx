import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskComments } from "@/components/operations/task-comments";
import { ApiRequestError } from "@/lib/api/onboarding";
import type { TaskCommentItem } from "@/lib/api/tasks";

const mocks = vi.hoisted(() => ({
  listTaskComments: vi.fn(),
  createTaskComment: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api/tasks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/tasks")>("@/lib/api/tasks");
  return {
    ...actual,
    listTaskComments: mocks.listTaskComments,
    createTaskComment: mocks.createTaskComment,
  };
});

vi.mock("@/lib/auth/session", () => ({
  getAuthTokenFromDocument: () => "token",
}));

vi.mock("@/lib/auth/support-session", () => ({
  hasActiveApiSession: () => true,
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn() },
}));

function comment(overrides: Partial<TaskCommentItem>): TaskCommentItem {
  return {
    id: 1,
    task_id: 5,
    body: "Shop was closed on arrival.",
    author: { id: 10, name: "Amara Agent", role: "agent", avatar_url: null },
    is_mine: false,
    created_at: "2026-10-30T09:00:00.000Z",
    ...overrides,
  };
}

function envelope<T>(data: T) {
  return { success: true, message: "ok", data, errors: null };
}

function renderComments() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TaskComments taskId={5} companyId={12} />
    </QueryClientProvider>,
  );
}

describe("TaskComments", () => {
  beforeEach(() => {
    mocks.listTaskComments.mockReset();
    mocks.createTaskComment.mockReset();
    mocks.toastError.mockReset();
  });

  it("shows a loading state, then comments with author name, role and time", async () => {
    mocks.listTaskComments.mockResolvedValue(
      envelope({
        can_comment: true,
        items: [
          comment({ id: 1 }),
          comment({
            id: 2,
            body: "Please retry tomorrow.",
            author: { id: 8, name: "Adam Admin", role: "admin", avatar_url: null },
            is_mine: true,
            created_at: "2026-10-30T10:00:00.000Z",
          }),
        ],
      }),
    );

    renderComments();
    expect(screen.getByText("Loading comments…")).not.toBeNull();

    expect(await screen.findByText("Shop was closed on arrival.")).not.toBeNull();
    expect(screen.getByText("Amara Agent")).not.toBeNull();
    expect(screen.getByText("Agent")).not.toBeNull();
    expect(screen.getByText("Admin")).not.toBeNull();
    expect(screen.getByText("(you)")).not.toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(mocks.listTaskComments).toHaveBeenCalledWith(5, { company_id: 12 }, "token");
  });

  it("shows an empty state", async () => {
    mocks.listTaskComments.mockResolvedValue(envelope({ can_comment: true, items: [] }));

    renderComments();

    expect(await screen.findByText(/No comments yet/)).not.toBeNull();
    expect(screen.getByLabelText("Add a comment")).not.toBeNull();
  });

  it("hides the form for read-only viewers", async () => {
    mocks.listTaskComments.mockResolvedValue(envelope({ can_comment: false, items: [comment({})] }));

    renderComments();

    expect(await screen.findByText("Shop was closed on arrival.")).not.toBeNull();
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
  });

  it("renders nothing when the user has no access to the thread", async () => {
    mocks.listTaskComments.mockRejectedValue(new ApiRequestError("Forbidden", 403));

    const { container } = renderComments();

    await waitFor(() => expect(mocks.listTaskComments).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("shows an error state with retry when loading fails", async () => {
    mocks.listTaskComments
      // 4xx errors (other than 403) are not retried, so the error state shows immediately.
      .mockRejectedValueOnce(new ApiRequestError("The requested resource was not found.", 404))
      .mockResolvedValueOnce(envelope({ can_comment: true, items: [comment({})] }));

    renderComments();

    expect(await screen.findByText(/Couldn.t load comments/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Shop was closed on arrival.")).not.toBeNull();
  });

  it("does not submit empty or whitespace-only comments", async () => {
    mocks.listTaskComments.mockResolvedValue(envelope({ can_comment: true, items: [] }));
    renderComments();

    const input = await screen.findByLabelText("Add a comment");
    fireEvent.change(input, { target: { value: "    " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);

    expect(screen.getByText("Comment cannot be empty.")).not.toBeNull();
    expect(mocks.createTaskComment).not.toHaveBeenCalled();
  });

  it("posts a trimmed comment, appends it and clears the input without a reload", async () => {
    const posted = comment({ id: 9, body: "On my way now.", is_mine: true });
    mocks.listTaskComments
      .mockResolvedValueOnce(envelope({ can_comment: true, items: [] }))
      .mockResolvedValue(envelope({ can_comment: true, items: [posted] }));
    mocks.createTaskComment.mockResolvedValue(envelope({ comment: posted }));

    renderComments();

    const input = (await screen.findByLabelText("Add a comment")) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "  On my way now.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() =>
      expect(mocks.createTaskComment).toHaveBeenCalledWith(
        5,
        { body: "On my way now.", company_id: 12 },
        "token",
      ),
    );
    expect(await screen.findByText("On my way now.")).not.toBeNull();
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("prevents duplicate submissions while a post is in flight", async () => {
    const posted = comment({ id: 3, body: "Double click test", is_mine: true });
    mocks.listTaskComments
      .mockResolvedValueOnce(envelope({ can_comment: true, items: [] }))
      .mockResolvedValue(envelope({ can_comment: true, items: [posted] }));
    let resolvePost: (value: unknown) => void = () => {};
    mocks.createTaskComment.mockReturnValue(new Promise((resolve) => (resolvePost = resolve)));

    renderComments();

    const input = await screen.findByLabelText("Add a comment");
    fireEvent.change(input, { target: { value: "Double click test" } });
    const form = input.closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.createTaskComment).toHaveBeenCalledTimes(1));
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(mocks.createTaskComment).toHaveBeenCalledTimes(1);
    resolvePost(envelope({ comment: posted }));
    expect(await screen.findByText("Double click test")).not.toBeNull();
  });

  it("surfaces backend validation and server errors", async () => {
    mocks.listTaskComments.mockResolvedValue(envelope({ can_comment: true, items: [] }));
    mocks.createTaskComment
      .mockRejectedValueOnce(
        new ApiRequestError("Comment cannot be empty.", 422, { body: ["Comment cannot be empty."] }),
      )
      .mockRejectedValueOnce(
        new ApiRequestError("Unable to save your comment right now. Please try again.", 500),
      );

    renderComments();

    const input = await screen.findByLabelText("Add a comment");
    fireEvent.change(input, { target: { value: "​ looks blank" } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByText("Comment cannot be empty.")).not.toBeNull();

    fireEvent.change(input, { target: { value: "Second try" } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        "Unable to save your comment right now. Please try again.",
      ),
    );
    expect((input as HTMLTextAreaElement).value).toBe("Second try");
  });
});
