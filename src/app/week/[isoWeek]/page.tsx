import { redirect } from "next/navigation";
export default async function R({ params }: { params: Promise<{ isoWeek: string }> }) {
  redirect(`/journal/week/${(await params).isoWeek}`);
}
