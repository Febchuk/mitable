import { notFound } from "next/navigation";
import { studentTestsEnabled } from "@/lib/feature-flags";

export default function TestsLayout({ children }: { children: React.ReactNode }) {
  if (!studentTestsEnabled()) notFound();
  return children;
}
