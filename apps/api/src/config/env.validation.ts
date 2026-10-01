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
  if (env.JWT_EXPIRES_IN !== undefined && !(Number(env.JWT_EXPIRES_IN) > 0)) {
    problems.push('JWT_EXPIRES_IN must be a positive number of seconds');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  }
  return env;
}
