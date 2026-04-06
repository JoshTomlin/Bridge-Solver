const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT || 3000;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const requestPath = req.url === "/" ? "/index.html" : req.url;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const extension = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream"
    });
    res.end(data);
  });
});

server.listen(port, () => {
  console.log(`Bridge Solver UI running at http://localhost:${port}`);
});
