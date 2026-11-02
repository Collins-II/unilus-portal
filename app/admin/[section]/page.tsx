import { notFound } from "next/navigation";
import { DealerPortal, type Section } from "@/components/dealer/portal";

const sections = ["inventory", "leads", "sales", "appointments", "customers", "reports"] as const;

export default async function DealerPage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ q?: string | string[] }> }) {
  const { section } = await params;
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  if (!sections.some((value) => value === section)) notFound();
  return <DealerPortal key={`${section}-${query}`} section={section as Section} initialSearch={query} />;
}
