import { createAuth } from '@dpg/auth';
import { allowed_origins, admin_domains } from '@dpg/config';
import { api, instance, auth, notification } from '@/config';
import { db } from '@api/db/postgres/drizzle_config';
import { redis } from '@api/db/secondary/redis';
import { getNotificationClient } from '@/utils/notificationClient';

function withDevLocalPort(url: URL): URL {
  const isLocalHost =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1';

  if (instance.INSTANCE_ENV === 'development' && !url.port && isLocalHost) {
    url.port = String(api.API_PORT);
  }

  return url;
}

function buildAuthBaseUrl(): string {
  const parsedUrl = withDevLocalPort(new URL(api.API_DOMAIN));
  // Auth routes are mounted at /api/auth on this Fastify instance.
  // Use origin + static auth path so reverse-proxy path prefixes in API_DOMAIN
  // don't break better-auth route matching.
  parsedUrl.pathname = '/api/auth';
  parsedUrl.search = '';
  parsedUrl.hash = '';
  return parsedUrl.toString().replace(/\/$/, '');
}

function buildAuthApiDomain(): string {
  const parsedUrl = withDevLocalPort(new URL(api.API_DOMAIN));
  return parsedUrl.origin;
}

export const authInstance = createAuth({
  appName: instance.INSTANCE_NAME ?? 'DPG',
  nodeEnv: instance.INSTANCE_ENV,

  baseURL: buildAuthBaseUrl(),

  secret: auth.AUTH_SECRET,
  apiDomain: buildAuthApiDomain(),

  trustedOrigins: allowed_origins,
  adminDomains: admin_domains,

  db: db,
  redis: redis,

  createTestOTP: auth.CREATE_TEST_OTP,
  notificationClient: getNotificationClient(),
  smsTemplateId: notification.SMS_TEMPLATE_ID,
});
