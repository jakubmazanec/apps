import {type Config} from 'tailwindcss';

export const tailwindConfig = {
  content: ['./app/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
