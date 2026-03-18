'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import Image from 'next/image';
import { Sidebar } from './Sidebar';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isFullPage = pathname.startsWith('/embed') || pathname === '/login' || pathname === '/set-password';

  if (isFullPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-20 flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3 md:hidden">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu className="w-6 h-6 text-gray-700" />
        </button>
        <Image src="/miller-logo.png" alt="Miller for Mayor" width={120} height={30} className="h-8 w-auto" />
      </div>

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="flex-1 p-6 ml-0 md:ml-64 pt-20 md:pt-6 min-w-0">{children}</main>
    </div>
  );
}
