import preset from "@staffly/config/eslint-preset";
export default [
  ...preset,
  {
    ignores: [".next/**", "next-env.d.ts"],
  },
];
