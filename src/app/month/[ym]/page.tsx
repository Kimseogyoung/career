import { redirect } from "next/navigation";
export default async function R({ params }: { params: Promise<{ ym: string }> }) {
  redirect(`/journal/month/${(await params).ym}`);
}
