import { SettingsShell } from "@/components/settings/settings-shell";

export const metadata = {
  title: "Settings | The Factory",
};

export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return <SettingsShell activeSection={section} />;
}
