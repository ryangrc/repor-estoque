import { AppError, exportList } from '../lib/domain';
import type { Database } from './database';
import { authenticate } from './security';
import { listItems, openList } from './shopping';
export async function downloadList(request: Request, db: Database) {
  const headers = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Type': 'application/json; charset=utf-8',
  };
  try {
    await authenticate(db, request);
    const data = exportList(await listItems(db, await openList(db)));
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        ...headers,
        'Content-Disposition': `attachment; filename="repor-compras-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error:
          error instanceof AppError
            ? error.message
            : 'Não foi possível exportar a lista.',
      }),
      { status: error instanceof AppError ? error.status : 500, headers },
    );
  }
}
