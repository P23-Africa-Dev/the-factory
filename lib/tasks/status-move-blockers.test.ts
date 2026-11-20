import { describe, expect, it } from "vitest";
import type { DndItem } from "@/types/operations";
import { completionBlockerLabels, getTaskCompletionBlockers } from "./status-move-blockers";

function itemWithSubtasks(
  subtasks: Array<{ id: string; title: string; isCompleted: boolean }>,
): DndItem {
  return {
    id: "1",
    label: "Agent",
    description: "Task",
    location: "",
    time: "",
    projectChecklist: {
      creatorId: "1",
      assigneeId: "2",
      assigneeName: "Agent",
      dueAt: null,
      subtasks: subtasks.map((s) => ({
        ...s,
        assigneeId: "2",
        assigneeName: "Agent",
        dueAt: null,
        completedAt: s.isCompleted ? "2026-01-01" : null,
      })),
    },
  };
}

describe("getTaskCompletionBlockers", () => {
  it("returns empty when there is no checklist", () => {
    expect(getTaskCompletionBlockers(undefined)).toEqual([]);
    expect(
      getTaskCompletionBlockers({
        id: "1",
        label: "A",
        description: "T",
        location: "",
        time: "",
      }),
    ).toEqual([]);
  });

  it("lists only incomplete subtasks", () => {
    const blockers = getTaskCompletionBlockers(
      itemWithSubtasks([
        { id: "a", title: "Call client", isCompleted: false },
        { id: "b", title: "Send quote", isCompleted: true },
        { id: "c", title: "Follow up", isCompleted: false },
      ]),
    );
    expect(blockers.map((b) => b.label)).toEqual(["Call client", "Follow up"]);
  });

  it("exposes labels for the confirm modal", () => {
    expect(
      completionBlockerLabels(
        itemWithSubtasks([{ id: "a", title: "Site visit", isCompleted: false }]),
      ),
    ).toEqual(["Site visit"]);
  });
});
