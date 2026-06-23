/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Internal @camp/* packages ship TypeScript source (no build step), so Next
  // must transpile them.
  transpilePackages: ["@camp/ui", "@camp/viz", "@camp/data"],
  // Linting is done once at the workspace root (`pnpm lint`), so skip Next's
  // own build-time ESLint pass (it expects eslint-config-next, which we don't use).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
