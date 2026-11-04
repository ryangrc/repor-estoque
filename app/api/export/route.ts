import { downloadList } from '@/server/export';
import { getDatabase } from '@/server/turso';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export function GET(request: Request) { return downloadList(request, getDatabase()); }
