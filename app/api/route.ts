import { env } from 'cloudflare:workers';
import { handle } from '@/server/api';
import type { Database } from '@/server/database';
import type { Config } from '@/server/security';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return handle(
    request,
    env.DB as unknown as Database,
    env as unknown as Config,
  );
}
export function POST(request: Request) {
  return handle(
    request,
    env.DB as unknown as Database,
    env as unknown as Config,
  );
}
