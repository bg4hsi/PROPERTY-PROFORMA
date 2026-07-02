import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { ink: "#102a43", brand: "#0f766e", canvas: "#f4f7f9" } } },
  plugins: [],
} satisfies Config;
