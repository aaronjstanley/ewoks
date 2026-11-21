(function () {
  "use strict";

  var STORAGE_KEY = "ewoks-troubleshoot-log";
  var MAX_ENTRIES = 200;
  var MAX_MESSAGE = 500;
  var API_URL = "https://br-summer-paper-bdlrumec-kybers5.compute.c-8.us-east-2.aws.neon.tech";
  var LOCAL_LOG_ENDPOINT = "/__ewok_log";
  var SESSION_ID =
    (typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
    ).slice(0, 36);

  var entries = loadEntries();
  var started = false;
  var syncTimer = null;

  function nowIso() {
    return new Date().toISOString();
  }

  function clip(value, max) {
    var text = String(value == null ? "" : value);
    if (text.length <= max) {
      return text;
    }
    return text.slice(0, max - 1) + "…";
  }

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
    } catch (error) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Storage may be full or blocked; keep in-memory entries only.
    }
    scheduleSync();
  }

  function scheduleSync() {
    if (syncTimer) {
      clearTimeout(syncTimer);
    }
    syncTimer = setTimeout(function () {
      syncTimer = null;
      sync(false);
    }, 1200);
  }

  function syncToLocalFile(text) {
    return fetch(LOCAL_LOG_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: text,
      keepalive: true,
    })
      .then(function (response) {
        return response.ok;
      })
      .catch(function () {
        return false;
      });
  }

  function syncToServer(text) {
    var context = pageContext();
    return fetch(API_URL + "/diagnostics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        playerName: context.player || "",
        pagePath: context.path,
        userAgent: context.ua,
        entryCount: entries.length,
        dump: text,
      }),
      keepalive: true,
    })
      .then(function (response) {
        return response.ok;
      })
      .catch(function () {
        return false;
      });
  }

  function sync(force) {
    var text = dumpText();
    if (!force && typeof fetch !== "function") {
      return Promise.resolve({ server: false, local: false });
    }

    return Promise.all([syncToServer(text), syncToLocalFile(text)]).then(
      function (results) {
        return { server: !!results[0], local: !!results[1] };
      }
    );
  }

  function push(level, category, message, detail) {
    var entry = {
      t: nowIso(),
      s: SESSION_ID,
      l: level,
      c: category,
      m: clip(message, MAX_MESSAGE),
    };

    if (detail != null && detail !== "") {
      try {
        entry.d = clip(
          typeof detail === "string" ? detail : JSON.stringify(detail),
          MAX_MESSAGE
        );
      } catch (error) {
        entry.d = clip(String(detail), MAX_MESSAGE);
      }
    }

    entries.push(entry);
    if (entries.length > MAX_ENTRIES) {
      entries = entries.slice(-MAX_ENTRIES);
    }
    persist();
    return entry;
  }

  function event(category, message, detail) {
    return push("info", category || "ui", message, detail);
  }

  function error(category, message, detail) {
    return push("error", category || "error", message, detail);
  }

  function warn(category, message, detail) {
    return push("warn", category || "warn", message, detail);
  }

  function pageContext() {
    return {
      path: location.pathname + location.search,
      href: location.href,
      ua: navigator.userAgent,
      lang: navigator.language,
      screen: screen.width + "x" + screen.height,
      viewport: window.innerWidth + "x" + window.innerHeight,
      online: navigator.onLine,
      ts: nowIso(),
      session: SESSION_ID,
      player: (function () {
        try {
          return localStorage.getItem("ewoks-player-name") || "";
        } catch (error) {
          return "";
        }
      })(),
    };
  }

  function dumpText() {
    var context = pageContext();
    var lines = [
      "Ewoks Forest Rescue · diagnostic log",
      "Generated: " + context.ts,
      "Session: " + context.session,
      "Page: " + context.path,
      "Player: " + (context.player || "(none)"),
      "UA: " + context.ua,
      "Viewport: " + context.viewport + " · Screen: " + context.screen,
      "Online: " + context.online,
      "Entries: " + entries.length,
      "----",
    ];

    entries.forEach(function (entry) {
      var line =
        entry.t +
        " [" +
        entry.l +
        "] " +
        entry.c +
        ": " +
        entry.m;
      if (entry.d) {
        line += " | " + entry.d;
      }
      lines.push(line);
    });

    return lines.join("\n");
  }

  function dumpJson() {
    return {
      context: pageContext(),
      entries: entries.slice(),
    };
  }

  function clear() {
    entries = [];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      // Keep in-memory clear even if storage is blocked.
    }
    scheduleSync();
  }

  function fetchRemoteList() {
    return fetch(API_URL + "/diagnostics")
      .then(function (response) {
        return response.json().then(function (data) {
          if (!response.ok) {
            throw new Error(data.error || "Unable to load remote logs.");
          }
          return data.logs || [];
        });
      });
  }

  function fetchRemoteDump(id) {
    var path =
      id == null || id === "latest"
        ? "/diagnostics/latest"
        : "/diagnostics/" + encodeURIComponent(String(id));
    return fetch(API_URL + path).then(function (response) {
      return response.text().then(function (text) {
        if (!response.ok) {
          throw new Error(text || "Unable to load diagnostic dump.");
        }
        return text;
      });
    });
  }

  function writeLocalAgentFile(text) {
    return syncToLocalFile(text || dumpText());
  }

  function labelFor(el) {
    if (!el || el === document || el === window) {
      return "document";
    }

    var parts = [el.tagName ? el.tagName.toLowerCase() : "node"];
    if (el.id) {
      parts.push("#" + el.id);
    }
    if (el.name) {
      parts.push('[name="' + el.name + '"]');
    }
    if (el.type) {
      parts.push("type=" + el.type);
    }
    if (el.getAttribute) {
      var aria = el.getAttribute("aria-label");
      if (aria) {
        parts.push('"' + clip(aria, 40) + '"');
      }
    }
    if (
      (el.tagName === "BUTTON" || el.tagName === "A") &&
      el.textContent
    ) {
      var text = el.textContent.replace(/\s+/g, " ").trim();
      if (text) {
        parts.push('"' + clip(text, 40) + '"');
      }
    }
    return parts.join(" ");
  }

  function interactiveTarget(target) {
    if (!target || !target.closest) {
      return null;
    }
    return target.closest(
      "button, a, input, select, textarea, [role='button'], [role='switch'], summary"
    );
  }

  function onClick(domEvent) {
    var el = interactiveTarget(domEvent.target);
    if (!el) {
      return;
    }
    event("ui", "click " + labelFor(el));
  }

  function onChange(domEvent) {
    var el = domEvent.target;
    if (!el || !el.tagName) {
      return;
    }
    var tag = el.tagName.toLowerCase();
    if (tag !== "input" && tag !== "select" && tag !== "textarea") {
      return;
    }
    var value = el.type === "password" ? "(hidden)" : clip(el.value, 80);
    if (el.type === "checkbox" || el.type === "radio") {
      value = String(el.checked);
    }
    event("ui", "change " + labelFor(el), { value: value });
  }

  function onSubmit(domEvent) {
    var form = domEvent.target;
    event("ui", "submit " + labelFor(form));
  }

  function onError(message, source, lineno, colno, errorObj) {
    error(
      "window",
      clip(message, MAX_MESSAGE),
      {
        source: source,
        line: lineno,
        col: colno,
        stack: errorObj && errorObj.stack ? clip(errorObj.stack, MAX_MESSAGE) : "",
      }
    );
  }

  function onRejection(rejectionEvent) {
    var reason = rejectionEvent.reason;
    var message =
      reason && reason.message
        ? reason.message
        : clip(reason, MAX_MESSAGE);
    error("promise", "unhandled rejection: " + message, {
      stack: reason && reason.stack ? clip(reason.stack, MAX_MESSAGE) : "",
    });
  }

  function start() {
    if (started) {
      return;
    }
    started = true;
    event("session", "log started", pageContext());
    document.addEventListener("click", onClick, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    window.addEventListener("error", function (errorEvent) {
      onError(
        errorEvent.message,
        errorEvent.filename,
        errorEvent.lineno,
        errorEvent.colno,
        errorEvent.error
      );
    });
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("offline", function () {
      warn("net", "offline");
    });
    window.addEventListener("online", function () {
      event("net", "online");
    });
  }

  window.EwokLog = {
    event: event,
    error: error,
    warn: warn,
    dump: dumpText,
    dumpJson: dumpJson,
    clear: clear,
    sync: sync,
    syncToAgentFile: sync,
    writeLocalAgentFile: writeLocalAgentFile,
    fetchRemoteList: fetchRemoteList,
    fetchRemoteDump: fetchRemoteDump,
    apiUrl: API_URL,
    agentFilePath: "dev/troubleshoot-log.txt",
    entries: function () {
      return entries.slice();
    },
    start: start,
    sessionId: SESSION_ID,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
