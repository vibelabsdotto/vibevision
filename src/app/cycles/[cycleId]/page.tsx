import { DashboardView } from "@/app/components/dashboard";

export default async function CyclePage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  return <DashboardView cycleId={cycleId} />;
}