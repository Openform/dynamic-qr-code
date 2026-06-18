const { performance } = require('perf_hooks');

const additions = [
  ['logo_url', 'ADD COLUMN logo_url VARCHAR(2048) NULL'],
  ['dot_style', "ADD COLUMN dot_style VARCHAR(32) NOT NULL DEFAULT 'square'"],
  ['corner_square_style', "ADD COLUMN corner_square_style VARCHAR(32) NOT NULL DEFAULT 'square'"],
  ['corner_dot_style', "ADD COLUMN corner_dot_style VARCHAR(32) NOT NULL DEFAULT 'square'"],
];

const missingColumns = additions.map(a => a[0]);

// Mock pool
const pool = {
  query: async (sql) => {
    // simulate network/db latency
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};

async function benchmarkOld() {
  const start = performance.now();
  for (const [name, clause] of additions) {
    if (missingColumns.includes(name)) {
      await pool.query(`ALTER TABLE qrcodes ${clause}`);
    }
  }
  const end = performance.now();
  return end - start;
}

async function benchmarkNew() {
  const start = performance.now();
  const clausesToAdd = additions
    .filter(([name]) => missingColumns.includes(name))
    .map(([, clause]) => clause);

  if (clausesToAdd.length > 0) {
    await pool.query(`ALTER TABLE qrcodes ${clausesToAdd.join(', ')}`);
  }
  const end = performance.now();
  return end - start;
}

async function run() {
  console.log("Running benchmarks...");
  let oldTime = 0;
  let newTime = 0;

  for(let i = 0; i < 5; i++) {
     oldTime += await benchmarkOld();
     newTime += await benchmarkNew();
  }

  console.log(`Old approach average: ${oldTime / 5} ms`);
  console.log(`New approach average: ${newTime / 5} ms`);
  console.log(`Improvement: ${((oldTime - newTime) / oldTime * 100).toFixed(2)}%`);
}

run();
