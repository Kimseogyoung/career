import { redirect } from "next/navigation";
export default async function R({ params }: { params: Promise<{ date: string }> }) {
  redirect(`/journal/day/${(await params).date}`);
}
