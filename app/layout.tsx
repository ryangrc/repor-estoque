import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Repor · Estoque e compras',
  description: 'Estoque em dia. Compras na medida certa.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/apple-touch-icon.png' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
