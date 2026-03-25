export const metadata = { title: 'Sign Up' };

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white min-h-screen">
      {children}
      <script
        dangerouslySetInnerHTML={{
          __html: `var $wc_load=function(a){return JSON.parse(JSON.stringify(a))},$wc_leads=$wc_leads||{doc:{url:$wc_load(document.URL),ref:$wc_load(document.referrer),search:$wc_load(location.search),hash:$wc_load(location.hash)}};`,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var s=document.createElement('script');s.src="//s.ksrndkehqnwntyxlhgto.com/164049.js";document.head.appendChild(s);})();`,
        }}
      />
    </div>
  );
}
