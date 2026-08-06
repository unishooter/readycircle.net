import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './index.js';

const localBase = {
  NODE_ENV: 'development',
  APP_ENV: 'development',
  DATABASE_URL: 'postgres://readycircle:readycircle_dev_password@localhost:5432/readycircle',
  SESSION_SECRET: 'dev-only-change-me-dev-only-change-me',
};

const productionBase = {
  NODE_ENV: 'production',
  APP_ENV: 'production',
  DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:rds!db-abc',
  SESSION_SECRET: 'production-session-secret-value-32chars',
  AWS_S3_DOCUMENT_BUCKET: 'readycircle-docs',
  AWS_SQS_PLAN_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/plan',
  AWS_SQS_DOCUMENT_QUEUE_URL: 'https://sqs.us-east-1.amazonaws.com/123/doc',
  COGNITO_USER_POOL_ID: 'us-east-1_example',
  COGNITO_CLIENT_ID: 'client-id',
  COGNITO_CLIENT_SECRET: 'client-secret',
  COGNITO_DOMAIN: 'https://auth.example.com',
  COGNITO_REDIRECT_URI: 'https://readycircle.net/api/v1/auth/callback',
  OPENAI_API_KEY: 'sk-test',
};

describe('loadConfig database credentials', () => {
  it('accepts DATABASE_URL alone in local development', () => {
    const config = loadConfig(localBase);
    expect(config.databaseUrl).toBe(localBase.DATABASE_URL);
    expect(config.databaseSecretArn).toBeNull();
  });

  it('rejects when neither DATABASE_URL nor DATABASE_SECRET_ARN is set', () => {
    expect(() =>
      loadConfig({
        ...localBase,
        DATABASE_URL: '',
        DATABASE_SECRET_ARN: '',
      }),
    ).toThrow(ConfigError);
  });

  it('keeps DATABASE_URL alongside DATABASE_SECRET_ARN for endpoint fallback', () => {
    const config = loadConfig({
      ...localBase,
      DATABASE_SECRET_ARN: 'arn:aws:secretsmanager:us-east-1:123:secret:db',
    });
    expect(config.databaseSecretArn).toBe('arn:aws:secretsmanager:us-east-1:123:secret:db');
    expect(config.databaseUrl).toBe(localBase.DATABASE_URL);
  });

  it('requires DATABASE_SECRET_ARN in production', () => {
    expect(() =>
      loadConfig({
        ...productionBase,
        DATABASE_SECRET_ARN: '',
        DATABASE_URL: 'postgres://admin:pw@db.example:5432/readycircle',
      }),
    ).toThrow(/DATABASE_SECRET_ARN/);
  });

  it('accepts production config with DATABASE_SECRET_ARN and optional DATABASE_URL', () => {
    const withUrl = loadConfig({
      ...productionBase,
      DATABASE_URL: 'postgres://admin@db.example:5432/readycircle',
    });
    expect(withUrl.databaseSecretArn).toBe(productionBase.DATABASE_SECRET_ARN);
    expect(withUrl.databaseUrl).toBe('postgres://admin@db.example:5432/readycircle');

    const arnOnly = loadConfig(productionBase);
    expect(arnOnly.databaseSecretArn).toBe(productionBase.DATABASE_SECRET_ARN);
    expect(arnOnly.databaseUrl).toBeNull();
    expect(arnOnly.isProduction).toBe(true);
  });
});
