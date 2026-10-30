import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/index.js';

const db = openDatabase(config.dbPath);
const app = createApp(db);

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
