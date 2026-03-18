import type { Metadata } from 'next';
import './globals.css';
import { LayoutShell } from '@/components/layout/LayoutShell';

export const metadata: Metadata = {
  title: 'VOL',
  description: 'Volunteer management system',
  icons: { icon: '/favicon.png' },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-gray-50 text-gray-900">
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
