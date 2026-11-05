import { handle } from '@/server/api';
import { getDatabase } from '@/server/turso';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function dispatch(request: Request) {
  return handle(request, getDatabase(), {
    APP_URL: process.env.APP_BASE_URL || process.env.APP_URL,
    EMAIL_API_KEY: process.env.RESEND_API_KEY || process.env.EMAIL_API_KEY,
    EMAIL_FROM: process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM,
    EMAIL_TEST_MODE: process.env.EMAIL_TEST_MODE,
    EMAIL_TEST_RECIPIENT: process.env.EMAIL_TEST_RECIPIENT,
  });
}
export const GET = dispatch;
export const POST = dispatch;
