// eslint.config.js
export default [
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "script"
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error"
    }
  }
];