/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");
module.exports = {
  content: ["./views/**/*.ejs", "./views/partials/**/*.ejs", "./index.js"],
  theme: {
    extend: {
      height: {
        450: "450px",
        407: "407px",
        704: "704px",
      },
      fontFamily: {
        sans: ["Inter var", ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
