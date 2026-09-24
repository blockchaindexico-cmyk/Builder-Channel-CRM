// Conventional Commits. Scope is usually the module id (M01..M10), e.g. `feat(M04): lead filters`.
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-case": [0],
    "subject-case": [0],
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};

export default config;
