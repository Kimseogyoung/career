import { redirect } from "next/navigation";
import { todayKst } from "@/lib/time";

// 일지 기본 진입 → 이번 달 월 보기.
export default function JournalIndex() {
  redirect(`/journal/month/${todayKst().slice(0, 7)}`);
}
