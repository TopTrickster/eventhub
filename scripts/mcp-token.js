// npm run mcp:token: signs in like the login form does and prints a session token for
// MCP_TOKEN. The token is an ordinary session of that one user: the MCP tools can do what
// that person can do in the browser, nothing more. Put it in your Codespaces secrets or
// your local .env, never in git.
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { loadConfig, loadDotEnv } from '../src/config/env.js';
import { createServicesFromConfig } from '../src/services/index.js';

loadDotEnv();
const { pool, services } = createServicesFromConfig(loadConfig());
const prompt = createInterface({ input: stdin, output: stdout });

try {
  const email = await prompt.question('Email: ');
  const password = await prompt.question('Password (shown as you type): ');
  const user = await services.auth.login({ email, password });
  const { token, expiresAt } = await services.auth.createSession(user.id);
  console.log(`\nSession for ${user.email} (${user.role}), valid until ${expiresAt.toISOString()}:`);
  console.log(token);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  prompt.close();
  await pool.end();
}
