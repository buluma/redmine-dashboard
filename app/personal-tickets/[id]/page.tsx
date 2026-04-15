import { redirect } from "next/navigation";

export const runtime = "nodejs";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PersonalTicketPage({ params }: Props) {
  const { id } = await params;
  redirect(`/issues/${encodeURIComponent(id)}`);
}
