export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  // JWT_SECRET is deliberately absent. It is read through
  // getSessionSecret() in server/auth.ts, which refuses an empty or weak one
  // instead of defaulting to "" and signing sessions anybody could forge.
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
