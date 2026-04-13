import { NextResponse } from 'next/server';
import { getSessionUserId } from '@/src/lib/session';
import { WakaTimeClient } from '@/src/lib/wakatime';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.WAKATIME_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'WakaTime not configured' }, { status: 503 });
  }

  const url = new URL(request.url);
  const range = url.searchParams.get('range') || undefined;

  try {
    const client = new WakaTimeClient(apiKey);
    const stats = await client.getStats(range);
    return NextResponse.json(stats);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
