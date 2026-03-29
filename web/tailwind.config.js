/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        proxie: {
          purple: '#534AB7',
          violet: '#7F77DD',
          lavender: '#AFA9EC',
          cloud: '#EEEDFE',
          deep: '#26215C',
        }
      }
    },
  },
  plugins: [],
}