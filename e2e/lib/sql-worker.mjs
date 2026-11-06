/**
 * A worker thread that holds one MySQL connection and answers SQL statements for
 * harness.mjs's synchronous sql(). The main thread posts a statement, blocks on a
 * shared flag, and reads the reply from a message port once this thread sets the
 * flag — so test code can read the database inline, without `await` on every
 * call and without starting a process per query.
 *
 * Connection settings come from the MYSQL_* environment variables.
 */
import { parentPort, workerData } from 'node:worker_threads';
import mysql from 'mysql2/promise';

const { signal, port } = workerData;

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  // DATETIME as "YYYY-MM-DD HH:MM:SS" strings, like the app's own pool.
  dateStrings: true,
});

parentPort.on('message', async (query) => {
  let reply;
  try {
    const [result] = await connection.query({ sql: query, rowsAsArray: true });
    // The same shape as `mysql -N -B`: rows one per line, columns tab-separated, NULL as "NULL".
    const output = Array.isArray(result)
      ? result.map((row) => row.map((value) => (value === null ? 'NULL' : String(value))).join('\t')).join('\n')
      : '';
    reply = { output };
  } catch (error) {
    reply = { error: error.message };
  }
  port.postMessage(reply);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
});
