import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

export interface SecretsManagerClientOptions {
  region: string;
  endpoint?: string;
}

export function createSecretsManagerClient(options: SecretsManagerClientOptions): SecretsManagerClient {
  return new SecretsManagerClient({ region: options.region, endpoint: options.endpoint });
}

/**
 * Fetches a secret string by name/ARN. Returns `undefined` when the secret
 * has no string payload (e.g. binary secrets), which callers should treat
 * as a configuration error.
 */
export async function getSecretString(client: SecretsManagerClient, secretId: string): Promise<string | undefined> {
  const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
  return result.SecretString;
}
