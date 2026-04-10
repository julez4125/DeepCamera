declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: string;
    DEBUG?: string;
    PORT?: string;
    HOST?: string;
    LOG_LEVEL?: string;
    CORS_ORIGIN?: string;
    DATABASE_URL?: string;
    KEYCLOAK_URL?: string;
    KEYCLOAK_REALM?: string;
    KEYCLOAK_CLIENT_ID?: string;
    KEYCLOAK_API_CLIENT_ID?: string;
    KEYCLOAK_API_CLIENT_SECRET?: string;
  }
}
