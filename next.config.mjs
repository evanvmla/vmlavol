/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'puppeteer-extra',
      'puppeteer-extra-plugin-stealth',
      'puppeteer-extra-plugin',
    ],
    outputFileTracingIncludes: {
      '/api/cron/instil-sync': [
        './node_modules/puppeteer-extra/**/*',
        './node_modules/puppeteer-extra-plugin/**/*',
        './node_modules/puppeteer-extra-plugin-stealth/**/*',
        './node_modules/merge-deep/**/*',
        './node_modules/clone-deep/**/*',
        './node_modules/deepmerge/**/*',
      ],
    },
  },
  async headers() {
    return [
      {
        source: '/embed/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
      {
        source: '/api/submit/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
      {
        source: '/((?!embed|api/submit).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
