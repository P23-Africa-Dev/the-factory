"use client";

import { Suspense } from "react";
import { DriveView } from "@/components/drive/drive-view";

export default function DrivePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Loading drive...</div>}>
      <DriveView />
    </Suspense>
  );
}
