export const metadata = { title: 'Sign Up' };

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white min-h-screen">
      {children}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            var defined_script_domain = "track.whatconverts.com";
            (function() {
              var s = document.createElement('script');
              s.src = "https://track.whatconverts.com/scripts/164049.js";
              s.async = true;
              document.head.appendChild(s);
            })();
          `,
        }}
      />
    </div>
  );
}
