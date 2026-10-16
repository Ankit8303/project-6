import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@browserbasehq/stagehand", "@browserbasehq/sdk"],
  outputFileTracingIncludes: {
    "/*": ["./public/stagehand-extension.zip", "./node_modules/@browserbasehq/stagehand/dist/assets/**/*"],
    "/api/**/*": ["./public/stagehand-extension.zip", "./node_modules/@browserbasehq/stagehand/dist/assets/**/*"],
    "/session/**/*": ["./public/stagehand-extension.zip", "./node_modules/@browserbasehq/stagehand/dist/assets/**/*"],
  },
};

export default nextConfig;
