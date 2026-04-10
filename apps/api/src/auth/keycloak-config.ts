export interface KeycloakConfig {
  url: string;
  realm: string;
  clientId: string;
  apiClientId: string;
  apiClientSecret: string;
  oidcDiscoveryUrl: string;
  jwksUri: string;
  issuer: string;
}

export function loadKeycloakConfig(): KeycloakConfig {
  const url = process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
  const realm = process.env.KEYCLOAK_REALM ?? 'ainvr';
  const clientId = process.env.KEYCLOAK_CLIENT_ID ?? 'ainvr-web';
  const apiClientId = process.env.KEYCLOAK_API_CLIENT_ID ?? 'ainvr-api';
  const apiClientSecret = process.env.KEYCLOAK_API_CLIENT_SECRET ?? 'ainvr-api-secret-dev';

  const oidcDiscoveryUrl = `${url}/realms/${realm}/.well-known/openid-configuration`;
  const jwksUri = `${url}/realms/${realm}/protocol/openid-connect/certs`;
  const issuer = `${url}/realms/${realm}`;

  return {
    url,
    realm,
    clientId,
    apiClientId,
    apiClientSecret,
    oidcDiscoveryUrl,
    jwksUri,
    issuer,
  };
}
