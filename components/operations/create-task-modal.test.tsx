import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CreateTaskModal } from "@/components/operations/create-task-modal";
import { useAuthStore, type AuthUser } from "@/store/auth";

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  createSelfTask: vi.fn(),
  assignees: [
    { id: 7, name: "Olivia Owner", email: "owner@example.com", role: "owner" },
    { id: 8, name: "Adam Admin", email: "admin@example.com", role: "admin" },
    { id: 9, name: "Sasha Supervisor", email: "supervisor@example.com", role: "supervisor" },
    { id: 10, name: "Amara Agent", email: "agent@example.com", role: "agent" },
  ],
}));

vi.mock("@/hooks/use-tasks", () => ({
  useCreateTask: () => ({ mutate: mocks.createTask, isPending: false }),
  useCreateSelfTask: () => ({ mutate: mocks.createSelfTask, isPending: false }),
  useTaskAssignees: () => ({ data: mocks.assignees, isLoading: false }),
  useTaskObserverCandidates: () => ({
    data: mocks.assignees.map(({ id, name }) => ({ id, name, avatar_url: null })),
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-projects", () => ({
  useInternalUsers: () => ({ data: [mocks.assignees[3]], isLoading: false }),
}));

vi.mock("@/components/ui/searchable-select", () => ({
  SearchableSelect: ({
    value,
    onChange,
    options,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    options: Array<{ value: string; label: string }>;
    placeholder: string;
  }) => (
    <select
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@/components/map/PlaceAutocompleteField", () => ({
  PlaceAutocompleteField: () => <input aria-label="Place autocomplete" />,
}));

function setUser(id: number, role: "owner" | "admin" | "supervisor" | "agent") {
  useAuthStore.setState({
    user: {
      id,
      name: `${role} user`,
      email: `${role}@example.com`,
      avatar: null,
      active_company: {
        id: 12,
        company_id: "FAC-12",
        name: "Factory",
        role,
      },
    } as AuthUser,
  });
}

function fillDescription(value: string) {
  fireEvent.change(screen.getByPlaceholderText("e.g. Check stock and speak to manager"), {
    target: { value },
  });
}

function fillTitle(value: string) {
  fireEvent.change(screen.getByPlaceholderText("e.g. Visit client store"), {
    target: { value },
  });
}

/** The assignee picker's root, so its checkboxes are not confused with the observer picker's. */
function assigneePicker() {
  return screen.getByRole("button", { name: "Select assignees" }).parentElement as HTMLElement;
}

function openAssignees() {
  fireEvent.click(screen.getByRole("button", { name: "Select assignees" }));
}

function assigneeCheckbox(name: string) {
  return within(assigneePicker()).getByRole("checkbox", { name }) as HTMLInputElement;
}

function checkedAssignees() {
  return within(assigneePicker())
    .getAllByRole("checkbox")
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => box.getAttribute("aria-label"));
}

function observerPicker() {
  return screen.getByRole("button", { name: "Select observers" }).parentElement as HTMLElement;
}

describe("CreateTaskModal task assignees", () => {
  beforeEach(() => {
    mocks.createTask.mockReset();
    mocks.createSelfTask.mockReset();
  });

  it.each([
    ["owner", 7, "Olivia Owner"],
    ["admin", 8, "Adam Admin"],
    ["supervisor", 9, "Sasha Supervisor"],
  ] as const)("preselects the logged-in %s from all company users", (role, id, name) => {
    setUser(id, role);

    render(<CreateTaskModal isOpen onClose={vi.fn()} />);
    openAssignees();

    expect(checkedAssignees()).toEqual([name]);
    for (const person of ["Olivia Owner", "Adam Admin", "Sasha Supervisor", "Amara Agent"]) {
      expect(assigneeCheckbox(person)).not.toBeNull();
    }
  });

  it("preserves an explicit edit-mode assignee", () => {
    setUser(7, "owner");

    render(
      <CreateTaskModal
        isOpen
        mode="edit"
        initialValues={{ assignTo: "10" }}
        onClose={vi.fn()}
      />,
    );
    openAssignees();

    expect(checkedAssignees()).toEqual(["Amara Agent"]);
  });

  it("preserves several edit-mode assignees", () => {
    setUser(7, "owner");

    render(
      <CreateTaskModal
        isOpen
        mode="edit"
        initialValues={{ assigneeIds: ["9", "10"] }}
        onClose={vi.fn()}
      />,
    );
    openAssignees();

    expect(checkedAssignees()).toEqual(["Sasha Supervisor", "Amara Agent"]);
  });

  it("preserves a selection while open and restores the default on reopen", () => {
    setUser(7, "owner");
    const onClose = vi.fn();
    const { rerender } = render(<CreateTaskModal isOpen onClose={onClose} />);

    openAssignees();
    fireEvent.click(assigneeCheckbox("Adam Admin"));
    rerender(<CreateTaskModal isOpen onClose={onClose} />);
    expect(checkedAssignees()).toEqual(["Olivia Owner", "Adam Admin"]);

    rerender(<CreateTaskModal isOpen={false} onClose={onClose} />);
    rerender(<CreateTaskModal isOpen onClose={onClose} />);
    openAssignees();

    expect(checkedAssignees()).toEqual(["Olivia Owner"]);
  });

  it("assigns a task to several people, primary first", () => {
    setUser(7, "owner");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fillTitle("Joint site visit");
    openAssignees();
    fireEvent.click(assigneeCheckbox("Olivia Owner"));
    fireEvent.click(assigneeCheckbox("Amara Agent"));
    fireEvent.click(assigneeCheckbox("Sasha Supervisor"));
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_agent_id: 10, assigned_agent_ids: [10, 9] }),
      expect.any(Object),
    );
  });

  it("submits the selected management user through assigned_agent_id", () => {
    setUser(7, "owner");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Visit client store"), {
      target: { value: "Review operations report" },
    });
    fillDescription("Check the stock and speak to the manager.");
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 12, assigned_agent_id: 7, assigned_agent_ids: [7] }),
      expect.any(Object),
    );
  });

  it("keeps agent-created tasks on the self-task flow", () => {
    setUser(10, "agent");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Select assignees" })).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("e.g. Visit client store"), {
      target: { value: "Agent field visit" },
    });
    fillDescription("Check the stock and speak to the manager.");
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(mocks.createSelfTask).toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });
});

describe("CreateTaskModal required fields", () => {
  beforeEach(() => {
    mocks.createTask.mockReset();
    mocks.createSelfTask.mockReset();
  });

  it.each([
    ["owner", 7],
    ["agent", 10],
  ] as const)("lets %s submit with only a title", (role, id) => {
    setUser(id, role);
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fillTitle("Visit the client office");
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    const submit = role === "agent" ? mocks.createSelfTask : mocks.createTask;
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Visit the client office", description: "" }),
      expect.any(Object),
    );
  });

  it("accepts a short description and sends it trimmed", () => {
    setUser(7, "owner");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fillTitle("Visit the client office");
    fillDescription("  Go  ");
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Go" }),
      expect.any(Object),
    );
  });

  it("blocks submission without a title", () => {
    setUser(7, "owner");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(screen.getByText("Task title is required")).not.toBeNull();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("blocks manager submission without an assignee", () => {
    setUser(7, "owner");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fillTitle("Visit the client office");
    openAssignees();
    fireEvent.click(assigneeCheckbox("Olivia Owner"));
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(screen.getByText("Select who this task is assigned to")).not.toBeNull();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it("opens the right-hand subtask modal on Add Subtask, preselects the parent task assignee, and adds the subtask on submit", () => {
    setUser(7, "owner");
    render(
      <CreateTaskModal
        isOpen
        onClose={vi.fn()}
        onProjectChecklistCreated={vi.fn()}
      />,
    );

    openAssignees();
    fireEvent.click(assigneeCheckbox("Olivia Owner"));
    fireEvent.click(assigneeCheckbox("Sasha Supervisor"));
    // Close the picker so only the subtask list shows these people.
    openAssignees();

    const subtaskInput = screen.getByPlaceholderText("Input your task title");
    expect(screen.queryByLabelText("Assign to")).toBeNull();
    expect(screen.queryByLabelText("Subtask due date and time")).toBeNull();

    fireEvent.change(subtaskInput, { target: { value: "Confirm delivery manifest" } });
    fireEvent.click(screen.getByRole("button", { name: "Multiple Tasks" }));

    const subtaskAssigneeSelect = screen.getByLabelText("Assign to") as HTMLSelectElement;
    expect(subtaskAssigneeSelect.value).toBe("9");

    fireEvent.change(subtaskAssigneeSelect, { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("Subtask due date and time"), {
      target: { value: "2026-11-12T14:30" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(screen.queryByLabelText("Assign to")).toBeNull();
    expect(screen.getByText("Confirm delivery manifest")).not.toBeNull();
    expect(screen.getByTitle("Amara Agent")).not.toBeNull();
  });
});

describe("CreateTaskModal observers", () => {
  beforeEach(() => {
    mocks.createTask.mockReset();
    mocks.createSelfTask.mockReset();
  });

  function openObserverList() {
    fireEvent.click(screen.getByRole("button", { name: "Select observers" }));
  }

  it("sends the selected observers when a manager creates a task", () => {
    setUser(7, "owner");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fillTitle("Visit the client office");
    openAssignees();
    fireEvent.click(assigneeCheckbox("Olivia Owner"));
    fireEvent.click(assigneeCheckbox("Amara Agent"));
    openObserverList();
    fireEvent.click(within(observerPicker()).getByRole("checkbox", { name: "Sasha Supervisor" }));
    fireEvent.click(within(observerPicker()).getByRole("checkbox", { name: "Adam Admin" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(mocks.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_agent_id: 10, observer_ids: [9, 8] }),
      expect.any(Object),
    );
  });

  it("does not offer the assignee as an observer", () => {
    setUser(7, "owner");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    openAssignees();
    fireEvent.click(assigneeCheckbox("Olivia Owner"));
    fireEvent.click(assigneeCheckbox("Amara Agent"));
    openObserverList();

    expect(within(observerPicker()).queryByRole("checkbox", { name: "Amara Agent" })).toBeNull();
    expect(within(observerPicker()).getByRole("checkbox", { name: "Olivia Owner" })).not.toBeNull();
  });

  it("lets an agent add observers to their own task, excluding themselves", () => {
    setUser(10, "agent");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fillTitle("Agent field visit");
    openObserverList();
    expect(within(observerPicker()).queryByRole("checkbox", { name: "Amara Agent" })).toBeNull();
    fireEvent.click(within(observerPicker()).getByRole("checkbox", { name: "Sasha Supervisor" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(mocks.createSelfTask).toHaveBeenCalledWith(
      expect.objectContaining({ observer_ids: [9] }),
      expect.any(Object),
    );
  });

  it("omits observers when none are picked", () => {
    setUser(7, "owner");
    render(<CreateTaskModal isOpen onClose={vi.fn()} />);

    fillTitle("Visit the client office");
    fireEvent.click(screen.getByRole("button", { name: "Create Task" }));

    expect(mocks.createTask.mock.calls[0][0].observer_ids).toBeUndefined();
  });
});
