import Link from "next/link";
import { AssessmentPanel } from "@/components/campus/assessment-panel";

export default function AssessmentsPage() {
  return <main className="dealer-main"><Link href="/" className="text-link">Back to campus workspace</Link><AssessmentPanel /></main>;
}
