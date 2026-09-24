const config = {
  "*.{ts,tsx,js,mjs,cjs}": ["eslint --fix --no-warn-ignored", "prettier --write"],
  "*.{json,css,yml,yaml}": ["prettier --write"],
};

export default config;
