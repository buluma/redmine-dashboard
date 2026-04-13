import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/db';
import { getSessionUserId } from '@/src/lib/session';
import { importStreamlineLogs } from '@/src/lib/streamline-import';

export const runtime = 'nodejs';

/**
 * Refresh Streamline logs from debugging/logs/ into Supabase.
 * Guard: Only imports the last 10 records per log file to prevent
 * accidental bulk imports from the refresh button.
 */
export async function POST() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const result = await importStreamlineLogs(prisma, {
      environment: process.env.STREAMLINE_ENV || 'staging',
      limit: 10, // Guard: max 10 records per file via refresh
    });

    return NextResponse.json({
      success: true,
      user: user.emailOrUsername,
      guardLimit: 10,
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 },
    );
  }
}
