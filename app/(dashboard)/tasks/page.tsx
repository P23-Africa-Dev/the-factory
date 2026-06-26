"use client";

import { Suspense } from "react";
import { AllTasksView } from "@/components/operations/all-tasks-view";

export default function TasksPage() {
    return (
        <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
            <div className="max-w-400 mx-auto flex flex-col gap-5">
                <Suspense fallback={<div className="w-full h-96 bg-white animate-pulse rounded-[20px]" />}>
                    <AllTasksView />
                </Suspense>
            </div>
        </div>
    );
}
