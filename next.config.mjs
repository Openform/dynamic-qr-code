/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['mysql2'],
  allowedDevOrigins: ['192.168.0.44'],
};

export default nextConfig;
