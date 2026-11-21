const { createServer } = require("http");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT) || 3000;
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(port, "0.0.0.0", () => {
    console.log(`> POS server ready on http://localhost:${port} (${dev ? "development" : "production"})`);
  });
});
