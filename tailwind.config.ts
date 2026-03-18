import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        blue: {
          50:  '#e6f0f7',
          100: '#b3d4e8',
          200: '#80b8d9',
          300: '#4d9cca',
          400: '#2680b5',
          500: '#00599c',
          600: '#004f8c',
          700: '#003f70',
          800: '#002f54',
          900: '#001f38',
          950: '#00141f',
        },
        gold: {
          50:  '#fff9e6',
          100: '#feefc0',
          200: '#fde49a',
          300: '#fdd973',
          400: '#fdcf4d',
          500: '#fdb926',
          600: '#e4a622',
          700: '#b3821a',
          800: '#825e13',
          900: '#523b0c',
          950: '#302208',
        },
      },
    },
  },
  plugins: [],
};
export default config;
