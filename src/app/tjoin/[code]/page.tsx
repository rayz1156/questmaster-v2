import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/participant/join-team?code=${encodeURIComponent(code)}`);
}
