import { NextResponse } from 'next/server';
import { prisma } from '@/src/lib/db';
import { getAuthenticatedUserId } from '@/src/lib/auth';
import { importStreamlineLogsFromAPI } from '@/src/lib/streamline-import';

export const runtime = 'nodejs';

/**
 * Refresh Streamline logs directly from Streamline API into Supabase.
 * Fetches directly from the Streamline API instead of local files.
 */
export async function POST() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch directly from Streamline API and import
    const result = await importStreamlineLogsFromAPI(prisma, {
      environment: process.env.STREAMLINE_ENV || 'staging',
      limit: 50, // Fetch last 50 records per type
    });

    return NextResponse.json({
      success: true,
      user: user.emailOrUsername,
      limit: 50,
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
