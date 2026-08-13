const { createServer } = require("http");
const next = require("next");

const app = next({ dev: true });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    handle(req, res);
  }).listen(3000, "0.0.0.0", () => {
    console.log("> Live development server ready on http://localhost:3000");
  });
});