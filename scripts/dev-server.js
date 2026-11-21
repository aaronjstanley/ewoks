#!/usr/bin/env node
"use strict";

var http = require("http");
var fs = require("fs");
var path = require("path");
var { URL } = require("url");

var ROOT = path.resolve(__dirname, "..");
var LOG_PATH = path.join(ROOT, "dev", "troubleshoot-log.txt");
var PORT = Number(process.env.PORT) || 8080;
var HOST = process.env.HOST || "127.0.0.1";

var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".dat": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function send(res, status, body, headers) {
  var payload = body == null ? "" : body;
  if (!Buffer.isBuffer(payload) && typeof payload !== "string") {
    payload = String(payload);
  }
  res.writeHead(status, Object.assign({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
  }, headers || {}));
  res.end(payload);
}

function safeJoin(root, requestPath) {
  var decoded = decodeURIComponent(requestPath.split("?")[0]);
  var cleaned = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  var full = path.join(root, cleaned);
  if (!full.startsWith(root)) {
    return null;
  }
  return full;
}

function contentType(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > 512 * 1024) {
        reject(new Error("Log payload too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function writeAgentLog(text) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, text, "utf8");
}

var server = http.createServer(function (req, res) {
  var method = req.method || "GET";
  var url = new URL(req.url || "/", "http://" + HOST + ":" + PORT);
  var pathname = url.pathname;

  if (method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  if (pathname === "/__ewok_log" && method === "POST") {
    readBody(req)
      .then(function (body) {
        writeAgentLog(body || "");
        send(res, 204, "", { "Content-Type": "text/plain; charset=utf-8" });
      })
      .catch(function (error) {
        send(res, 400, error.message || "Unable to write log.", {
          "Content-Type": "text/plain; charset=utf-8",
        });
      });
    return;
  }

  if (pathname === "/__ewok_log" && (method === "GET" || method === "HEAD")) {
    fs.readFile(LOG_PATH, "utf8", function (error, data) {
      if (error) {
        send(res, 404, "No agent log file yet. Open /log.html or play the game first.", {
          "Content-Type": "text/plain; charset=utf-8",
        });
        return;
      }
      if (method === "HEAD") {
        send(res, 200, "", {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Length": Buffer.byteLength(data),
        });
        return;
      }
      send(res, 200, data, { "Content-Type": "text/plain; charset=utf-8" });
    });
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    send(res, 405, "Method not allowed");
    return;
  }

  var filePath = safeJoin(ROOT, pathname === "/" ? "/index.html" : pathname);
  if (!filePath) {
    send(res, 400, "Bad path");
    return;
  }

  fs.stat(filePath, function (error, stats) {
    if (!error && stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }

    fs.readFile(filePath, function (readError, data) {
      if (readError) {
        send(res, 404, "Not found");
        return;
      }
      if (method === "HEAD") {
        send(res, 200, "", {
          "Content-Type": contentType(filePath),
          "Content-Length": data.length,
        });
        return;
      }
      send(res, 200, data, { "Content-Type": contentType(filePath) });
    });
  });
});

server.listen(PORT, HOST, function () {
  console.log("Ewoks dev server at http://" + HOST + ":" + PORT);
  console.log("Troubleshooting UI: http://" + HOST + ":" + PORT + "/log.html");
  console.log("Agent log file: " + LOG_PATH);
});
