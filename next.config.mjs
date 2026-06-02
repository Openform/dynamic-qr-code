/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  allowedDevOrigins: ['192.168.0.44'],
};

export default nextConfig;
