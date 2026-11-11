import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskCard } from "@/components/operations/task-card";
import type { DndItem } from "@/types/operations";

function buildChecklistItem(overrides: Partial<DndItem> = {}): DndItem {
  return {
    id: "task-1",
    label: "Tommy Shelby",
    description: "Demo · Review site visit",
    location: "Created: Nov 6, 2026",
    time: "Just now",
    statusLabel: "In Progress",
    commentCount: 3,
    projectChecklist: {
      creatorId: "user-1",
      assigneeId: "user-1",
      assigneeName: "Tommy Shelby",
      dueAt: "2026-11-15T23:19:00.000Z",
      initialComments: [
        "Site photos from the morning inspection are ready.",
        "Waiting on supervisor sign-off.",
        "Will send the summary right after review.",
      ],
      subtasks: [
        {
          id: "sub-1",
          title: "Collect visit notes",
          assigneeId: "user-1",
          assigneeName: "Tommy Shelby",
          dueAt: "2026-11-14T23:15:00.000Z",
          isCompleted: true,
          completedAt: "2026-11-10T10:00:00.000Z",
        },
        {
          id: "sub-2",
          title: "Review action items",
          assigneeId: "user-1",
          assigneeName: "Tommy Shelby",
          dueAt: "2026-11-14T23:15:00.000Z",
          isCompleted: false,
          completedAt: null,
        },
        {
          id: "sub-3",
          title: "Send the visit summary",
          assigneeId: "user-1",
          assigneeName: "Tommy Shelby",
          dueAt: "2026-11-14T23:15:00.000Z",
          isCompleted: false,
          completedAt: null,
        },
      ],
    },
    ...overrides,
  };
}

describe("TaskCard checklist UI", () => {
  it("renders checklist progress, comment count, and toggles collapsible subtasks", () => {
    const onToggleSubtask = vi.fn();
    render(
      <TaskCard
        item={buildChecklistItem()}
        checklistUserId="user-1"
        onToggleSubtask={onToggleSubtask}
      />,
    );

    expect(screen.getByText("1/3")).not.toBeNull();
    expect(screen.getByLabelText("3 comments")).not.toBeNull();
    expect(screen.getByText("Collect visit notes")).not.toBeNull();
    expect(screen.getByText("Review action items")).not.toBeNull();

    const checkbox = screen.getByRole("checkbox", { name: "Review action items" });
    fireEvent.click(checkbox);
    expect(onToggleSubtask).toHaveBeenCalledWith("task-1", "sub-2");

    const collapseBtn = screen.getByRole("button", { name: "Collapse checklist" });
    expect(collapseBtn.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(collapseBtn);

    expect(screen.queryByText("Review action items")).toBeNull();
    const expandBtn = screen.getByRole("button", { name: "Expand checklist" });
    expect(expandBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("allows adding a subtask inline directly on the card", () => {
    const onAddSubtask = vi.fn();
    render(
      <TaskCard
        item={buildChecklistItem()}
        checklistUserId="user-1"
        onAddSubtask={onAddSubtask}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add subtask" }));
    const input = screen.getByLabelText("New subtask title");
    fireEvent.change(input, { target: { value: "Follow up with client" } });
    fireEvent.submit(input.closest("form")!);

    expect(onAddSubtask).toHaveBeenCalledWith("task-1", "Follow up with client");
  });

  it("reorders subtasks via the drag handle", () => {
    const onReorderSubtasks = vi.fn();
    render(
      <TaskCard
        item={buildChecklistItem()}
        checklistUserId="user-1"
        onReorderSubtasks={onReorderSubtasks}
      />,
    );

    const reorderSecond = screen.getByRole("button", { name: "Reorder Review action items" });
    fireEvent.keyDown(reorderSecond, { key: "ArrowUp" });

    expect(onReorderSubtasks).toHaveBeenCalledTimes(1);
    const [, reordered] = onReorderSubtasks.mock.calls[0];
    expect(reordered.map((s: { id: string }) => s.id)).toEqual(["sub-2", "sub-1", "sub-3"]);
  });
});
