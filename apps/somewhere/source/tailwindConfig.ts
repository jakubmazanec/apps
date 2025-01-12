import {type Config} from 'tailwindcss';

export const tailwindConfig = {
  content: ['./source/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
