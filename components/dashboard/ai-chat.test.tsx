import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIChat } from "@/components/dashboard/ai-chat";

const {
    initializeMock,
    sendMessageMock,
    queueWeeklyReportMock,
    downloadWeeklyReportMock,
    runVoiceTranscriptionMock,
    runFileAnalysisMock,
    runTranscriptSummaryMock,
    loadForecastOverviewMock,
    useCopilotChatMock,
} = vi.hoisted(() => ({
    initializeMock: vi.fn(),
    sendMessageMock: vi.fn(),
    queueWeeklyReportMock: vi.fn(),
    downloadWeeklyReportMock: vi.fn(),
    runVoiceTranscriptionMock: vi.fn(),
    runFileAnalysisMock: vi.fn(),
    runTranscriptSummaryMock: vi.fn(),
    loadForecastOverviewMock: vi.fn(),
    useCopilotChatMock: vi.fn(),
}));

vi.mock("next/image", () => ({
    default: (props: { src: string; alt: string }) => <img src={props.src} alt={props.alt} />,
}));

vi.mock("@/hooks/use-copilot-chat", () => ({
    useCopilotChat: () => useCopilotChatMock(),
}));

vi.mock("@/store/auth", () => ({
    useAuthStore: vi.fn((selector: (state: { user: unknown }) => unknown) =>
        selector({
            user: {
                id: 12,
                name: "Ada Test",
                avatar: null,
                active_company: { company_id: 99 },
            },
        })
    ),
}));

vi.mock("@/lib/company-context", () => ({
    getActiveCompanyContext: vi.fn(() => ({
        apiCompanyId: 99,
        role: "admin",
    })),
}));

describe("AIChat", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Element.prototype.scrollIntoView = vi.fn();

        useCopilotChatMock.mockReturnValue({
            messages: [
                {
                    id: "a1",
                    role: "assistant",
                    content: "Use this source-aware answer.",
                    sources: ["tasks.overdue"],
                },
            ],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
        });
    });

    it("initializes chat and renders assistant source chips", async () => {
        render(<AIChat open onClose={() => { }} />);

        await waitFor(() => {
            expect(initializeMock).toHaveBeenCalledWith(99);
        });

        expect(screen.getByText("Use this source-aware answer.")).toBeTruthy();
        expect(screen.getByText("tasks.overdue")).toBeTruthy();
    });

    it("sends input content through copilot hook", async () => {
        render(<AIChat open onClose={() => { }} />);

        const input = screen.getByPlaceholderText("Ask Anything...");
        fireEvent.change(input, { target: { value: "What is overdue?" } });
        fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

        await waitFor(() => {
            expect(sendMessageMock).toHaveBeenCalledWith({
                message: "What is overdue?",
                companyId: 99,
            });
        });
    });

    it("confirms action requests using assistant payload", async () => {
        useCopilotChatMock.mockReturnValue({
            messages: [
                {
                    id: "u1",
                    role: "user",
                    content: "Create task for dispatch checks",
                    sources: [],
                },
                {
                    id: "a2",
                    role: "assistant",
                    content: "This action requires explicit confirmation.",
                    sources: ["tasks.create"],
                    payload: {
                        confirmation_required: true,
                        action_args: {
                            title: "Dispatch checks",
                            location: "Ops Yard",
                        },
                    },
                },
            ],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
        });

        render(<AIChat open onClose={() => { }} />);

        fireEvent.click(screen.getByText("Confirm Action"));

        await waitFor(() => {
            expect(sendMessageMock).toHaveBeenCalledWith({
                message: "Create task for dispatch checks",
                companyId: 99,
                actionConfirmed: true,
                actionArgs: {
                    title: "Dispatch checks",
                    location: "Ops Yard",
                },
            });
        });
    });

    it("queues weekly summary from quick action button", async () => {
        useCopilotChatMock.mockReturnValue({
            messages: [],
            isStreaming: false,
            weeklyReport: null,
            isQueueingWeeklyReport: false,
            initialize: initializeMock,
            sendMessage: sendMessageMock,
            queueWeeklyReport: queueWeeklyReportMock,
            downloadWeeklyReport: downloadWeeklyReportMock,
            runVoiceTranscription: runVoiceTranscriptionMock,
            runFileAnalysis: runFileAnalysisMock,
            runTranscriptSummary: runTranscriptSummaryMock,
            loadForecastOverview: loadForecastOverviewMock,
        });

        render(<AIChat open onClose={() => { }} />);

        fireEvent.click(screen.getByText("Generate Weekly Summary"));

        await waitFor(() => {
            expect(queueWeeklyReportMock).toHaveBeenCalledWith(99);
        });
    });
});
