const { createServer } = require('./app');

const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || '127.0.0.1';

const { server } = createServer({
  persist: process.env.ARENA_API_PERSIST !== '0',
  storeFile: process.env.ARENA_API_STORE_FILE,
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Performance Arena API listening at http://${host}:${port}/api`);
});
