/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": require("path").join(__dirname, ".."),
    };
    return config;
  },
};

export default nextConfig;
