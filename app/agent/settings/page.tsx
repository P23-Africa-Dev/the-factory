import { redirect } from "next/navigation";

export const metadata = {
  title: "Settings — The Factory",
};

export default function AgentSettingsIndexPage() {
  redirect("/agent/settings/profile");
}
