/**
 * Checks the environment once, when the API starts (ConfigModule's
 * `validate` hook): a missing setting stops the startup with a clear
 * message, instead of surfacing later as a 500 on the first login.
 *
 * In Docker, docker-compose.yml passes JWT_SECRET even when .env doesn't
 * define it (as an empty string), so "empty" counts as missing.
 */
export function validateEnv(env: Record<string, unknown>): Record<string, unknown> {
  const problems: string[] = [];
  const text = (name: string) => (typeof env[name] === 'string' ? (env[name] as string).trim() : '');

  if (!text('DATABASE_URL')) problems.push('DATABASE_URL is not set');
  if (!text('JWT_SECRET')) {
    problems.push('JWT_SECRET is not set (see .env.example)');
  } else if (env.NODE_ENV === 'production' && text('JWT_SECRET') === 'change-me') {
    problems.push('JWT_SECRET still has the placeholder value of .env.example');
  }
  // MEM-85: the lifetimes of the access token and of the renewal token.
  for (const name of ['ACCESS_TOKEN_TTL', 'REFRESH_TOKEN_TTL']) {
    if (text(name) && !(Number(env[name]) > 0)) problems.push(`${name} must be a positive number of seconds`);
  }

  // MEM-82: the administration console is optional (off without ADMIN_JWT_SECRET).
  // Its secret must not be the users' one: a user token would then be checked with it.
  if (text('ADMIN_JWT_SECRET')) {
    if (text('ADMIN_JWT_SECRET') === text('JWT_SECRET')) {
      problems.push('ADMIN_JWT_SECRET must differ from JWT_SECRET');
    } else if (env.NODE_ENV === 'production' && text('ADMIN_JWT_SECRET') === 'change-me') {
      problems.push('ADMIN_JWT_SECRET still has a placeholder value');
    }
  }
  if (text('ADMIN_SESSION_TTL') && !(Number(env.ADMIN_SESSION_TTL) > 0)) {
    problems.push('ADMIN_SESSION_TTL must be a positive number of seconds');
  }

  // E-mails (phase 11) are optional: without SMTP_HOST, the reminders are
  // simply not sent. With it, the rest must be right.
  if (text('SMTP_HOST')) {
    if (text('SMTP_PORT') && !Number.isInteger(Number(text('SMTP_PORT')))) {
      problems.push('SMTP_PORT must be a port number');
    }
    if (!text('MAIL_FROM') && !text('SMTP_USER')) {
      problems.push('MAIL_FROM (or SMTP_USER) is needed to send e-mails');
    }
    if (!/^https?:\/\/[^/]+/.test(text('APP_URL'))) {
      problems.push('APP_URL (e.g. https://mementorize.example.fr) is needed for the links in e-mails');
    }
  }

  // Pronunciation (MEM-39) is optional: without KOKORO_URL, the web app
  // keeps the browser's speech synthesis.
  if (text('KOKORO_URL') && !/^https?:\/\/[^/]+/.test(text('KOKORO_URL'))) {
    problems.push('KOKORO_URL must be the address of the Kokoro server (e.g. http://kokoro:8880)');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
