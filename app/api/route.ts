import { handle } from '@/server/api';
import { getDatabase } from '@/server/turso';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
function dispatch(request: Request) {
  return handle(request, getDatabase(), {
    APP_URL: process.env.APP_URL,
    EMAIL_API_KEY: process.env.EMAIL_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_API_URL: process.env.EMAIL_API_URL,
  });
}
export const GET = dispatch;
export const POST = dispatch;
