export const metadata = { title: 'Sign Up' };

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-white min-h-screen">{children}</div>;
}
