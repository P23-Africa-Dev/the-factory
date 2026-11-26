/** The phone's last tracking report for a field trip (journey.tracking_health). */
export type TrackingHealth = {
  source?: "native" | "web";
  app_version?: string;
  app_state?: string;
  permission?: string;
  precise?: boolean;
  location_services_on?: boolean;
  battery_optimized?: boolean;
  fixes?: number;
  last_fix_at?: string;
  last_accuracy_m?: number;
  queued?: number;
  uploaded?: number;
  failed_uploads?: number;
  last_error?: string;
  reported_at?: string;
  received_at?: string;
};

export type TrackingHealthSummary = {
  /** "good" when nothing explains a short or broken route. */
  status: "good" | "warning";
  /** Plain-language problems, most important first. */
  issues: string[];
  /** Key facts for support. */
  facts: Array<{ label: string; value: string }>;
};

/** Turn the raw report into what a manager needs: is tracking healthy, and if not, why. */
export function describeTrackingHealth(h: TrackingHealth): TrackingHealthSummary {
  const issues: string[] = [];
  if (h.location_services_on === false) issues.push("Location was turned off on the phone.");
  if (h.permission === "denied") issues.push("The app is not allowed to use location.");
  else if (h.permission === "while_in_use" && h.source === "native")
    issues.push('Location is allowed only while the app is open (not "all the time").');
  if (h.precise === false) issues.push("Precise location is off (approximate only).");
  if (h.source === "web")
    issues.push("Recorded by the browser or an older app version: it stops when the screen is off.");
  if (h.battery_optimized === true)
    issues.push("Battery optimisation is on for the app; Android may pause tracking.");
  if ((h.queued ?? 0) > 0) issues.push(`${h.queued} points were still waiting to upload.`);
  if (h.last_error) issues.push(`Last problem: ${h.last_error}`);

  const facts: Array<{ label: string; value: string }> = [];
  facts.push({ label: "Recorder", value: h.source === "native" ? `App ${h.app_version ?? ""}`.trim() : "Browser / older app" });
  if (h.fixes != null) facts.push({ label: "GPS fixes", value: String(h.fixes) });
  if (h.uploaded != null) facts.push({ label: "Points uploaded", value: String(h.uploaded) });
  if (h.last_accuracy_m != null) facts.push({ label: "Last accuracy", value: `${Math.round(h.last_accuracy_m)} m` });
  if (h.app_state) facts.push({ label: "App was", value: h.app_state === "foreground" ? "Open" : "In background" });

  return { status: issues.length > 0 ? "warning" : "good", issues, facts };
}
