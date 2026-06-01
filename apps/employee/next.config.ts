import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@staffly/ui", "@staffly/types", "@staffly/i18n"],
};

export default config;
