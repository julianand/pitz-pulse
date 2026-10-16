import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`[pitz-pulse] listening on http://localhost:${env.PORT} (env=${env.NODE_ENV})`);
});
