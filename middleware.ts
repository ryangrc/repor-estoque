import { NextResponse, type NextRequest } from 'next/server';
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'" +
      (process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'") +
      "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'" +
      (process.env.NODE_ENV === 'production' ? '' : ' ws:') +
      "; object-src 'none'; base-uri 'self'; form-action 'self'",
  );
  response.headers.set('Cache-Control', 'no-store');
  if (request.nextUrl.protocol === 'https:')
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return response;
}
export const config = { matcher: ['/', '/api'] };
