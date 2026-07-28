import globals from "globals";

const commonRules = {
  "no-undef": "error",
  "no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      caughtErrors: "none",
    },
  ],
  eqeqeq: ["error", "always"],
};

export default [
  {
    ignores: ["node_modules/**", "src/generated/**"],
  },
  {
    files: ["src/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: commonRules,
  },
  {
    files: ["client/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: commonRules,
  },
  {
    files: ["test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: commonRules,
  },
];
