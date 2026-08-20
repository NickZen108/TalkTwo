import { Buffer } from 'node:buffer';
import {
  Environment,
  SignedDataVerifier,
} from 'npm:@apple/app-store-server-library@3.1.0';

import { requiredEnv } from './http.ts';

function rootCertificates() {
  const values = JSON.parse(requiredEnv('APPLE_ROOT_CA_DER_BASE64_JSON')) as unknown;
  if (!Array.isArray(values) || values.length === 0 || values.some((item) => typeof item !== 'string')) {
    throw new Error('APPLE_ROOT_CA_DER_BASE64_JSON must be a non-empty JSON string array.');
  }
  return values.map((value) => Buffer.from(value, 'base64'));
}

export function appleVerifier() {
  const configuredEnvironment = requiredEnv('APPLE_ENVIRONMENT').toLowerCase();
  const environment = configuredEnvironment === 'production'
    ? Environment.PRODUCTION
    : configuredEnvironment === 'sandbox'
      ? Environment.SANDBOX
      : null;
  if (!environment) throw new Error('APPLE_ENVIRONMENT must be Sandbox or Production.');

  const appleIdText = Deno.env.get('APPLE_APP_ID')?.trim();
  const appleId = appleIdText ? Number(appleIdText) : undefined;
  if (environment === Environment.PRODUCTION && (!appleId || !Number.isSafeInteger(appleId))) {
    throw new Error('APPLE_APP_ID is required for Production.');
  }

  return new SignedDataVerifier(
    rootCertificates(),
    true,
    environment,
    requiredEnv('APPLE_BUNDLE_ID'),
    appleId,
  );
}
