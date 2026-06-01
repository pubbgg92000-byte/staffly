// Next.js uses its own ESLint config via `next lint`. The flat-config bridge is opt-in
// per https://nextjs.org/docs/app/api-reference/config/eslint. We rely on the
// .eslintrc-equivalent settings shipped via `eslint-config-next` for now.
import preset from "@staffly/config/eslint-preset";
export default [
  ...preset,
  {
    ignores: [".next/**", "next-env.d.ts"],
  },
];
