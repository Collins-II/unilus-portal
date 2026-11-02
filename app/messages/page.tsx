import { Suspense } from "react";
import { Inbox } from "@/components/dealer/inbox";

export const metadata = { title: "Messages" };

export default function MessagesPage() {
  return <Suspense><Inbox /></Suspense>;
}