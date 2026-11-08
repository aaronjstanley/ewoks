(function () {
  "use strict";

  var API_URL = "https://br-summer-paper-bdlrumec-kybers5.compute.c-8.us-east-2.aws.neon.tech";
  var PLAYER_ID_KEY = "ewoks-player-id";
  var PLAYER_NAME_KEY = "ewoks-player-name";

  function validPlayerId(id) {
    return (
      typeof id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    );
  }

  function playerId() {
    var id = localStorage.getItem(PLAYER_ID_KEY);
    if (!validPlayerId(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  }

  function request(path, options) {
    return fetch(API_URL + path, options).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          throw new Error(data.error || "The forest network is unavailable.");
        }
        return data;
      });
    });
  }

  function register(name) {
    return request("/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: playerId(), name: name }),
    }).then(function (data) {
      if (data.player.id) {
        localStorage.setItem(PLAYER_ID_KEY, data.player.id);
      }
      localStorage.setItem(PLAYER_NAME_KEY, data.player.name);
      return data.player;
    });
  }

  function save(completed, reached, stats) {
    return request("/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: playerId(),
        completed: completed,
        reached: reached,
        elapsedMs: stats.elapsedMs,
        speed: stats.speed,
        survivorPercentage: stats.survivorPercentage,
      }),
    });
  }

  function recordFailedAttempt(attempted) {
    return request("/attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: playerId(),
        attempted: attempted,
      }),
    });
  }

  function useWicket(completed, reached) {
    return request("/wicket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: playerId(),
        completed: completed,
        reached: reached,
      }),
    });
  }

  function leaderboard() {
    return request("/leaderboard");
  }

  window.EwokProgress = {
    register: register,
    save: save,
    recordFailedAttempt: recordFailedAttempt,
    useWicket: useWicket,
    leaderboard: leaderboard,
    storedName: function () {
      return localStorage.getItem(PLAYER_NAME_KEY) || "";
    },
  };
})();
