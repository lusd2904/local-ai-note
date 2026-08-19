/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        mac: {
          sidebar: '#F6F6F6',
          sidebarDark: '#1E1E1E',
          list: '#FFFFFF',
          listDark: '#252526',
          editor: '#FFFFFF',
          editorDark: '#1E1E1E',
          accent: '#0A84FF',
          border: '#E5E5E5',
          borderDark: '#333333'
        }
      }
    },
  },
  plugins: [],
}
