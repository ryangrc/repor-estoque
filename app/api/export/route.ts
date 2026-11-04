import { env } from 'cloudflare:workers';
import { downloadList } from '@/server/export';
import type { Database } from '@/server/database';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return downloadList(request, env.DB as unknown as Database);
}
