
// ==========================================
// HITSTER DIGITAL – SPIELVERBINDUNG
// ==========================================

// Supabase-Verbindung
const SUPABASE_URL = "https://emxuwtoysqizvazvylyb.supabase.co";
const SUPABASE_KEY = "sb_publishable__9lNBaOjKcmpIPbwX9Kr9Q_WNeyo";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const app = document.querySelector("#app");

let currentChannel = null;
let currentLobby = null;
let currentPlayer = null;


// ==========================================
// HILFSFUNKTIONEN
// ==========================================

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return "player-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function getPlayerId() {
  let id = localStorage.getItem("hitster-player-id");

  if (!id) {
    id = createId();
    localStorage.setItem("hitster-player-id", id);
  }

  return id;
}

function createGameCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return entities[character];
  });
}

function setMessage(text) {
  const message = document.querySelector("#lobby-message");

  if (message) {
    message.textContent = text;
  }
}

function stopRealtime() {
  if (currentChannel) {
    db.removeChannel(currentChannel);
    currentChannel = null;
  }
}


// ==========================================
// STARTSEITE
// ==========================================

function showStartseite() {
  stopRealtime();

  app.classList.remove("lobby-screen");

  app.innerHTML = `
    <div class="logo">♫</div>

    <p class="untertitel">DAS MUSIKSPIEL</p>

    <h1>Hitster <span>Digital</span></h1>

    <p class="beschreibung">
      Erkenne die Songs, ordne sie auf deiner Zeitleiste ein
      und finde heraus, wer die Musikgeschichte am besten kennt.
    </p>

    <button id="create-game">Spiel erstellen</button>

    <p class="hinweis">
      Ein Tablet als Spielzentrale – jeder spielt mit dem eigenen Smartphone.
    </p>
  `;

  document.querySelector("#create-game")
    .addEventListener("click", createGame);
}


// ==========================================
// SPIEL ERSTELLEN – TABLET
// ==========================================

async function createGame() {
  app.innerHTML = `
    <div class="logo">♫</div>
    <p class="untertitel">SPIEL WIRD ERSTELLT</p>
    <h1>Einen Moment ...</h1>
  `;

  let lobby = null;

  try {
    const code = createGameCode();

    const { data, error } = await db
      .from("game_lobbies")
      .insert({
        code: code,
        players: []
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    lobby = data;

  } catch (error) {
    console.error("Fehler beim Erstellen:", error);

    app.innerHTML = `
      <h1>Fehler</h1>
      <p class="beschreibung">
        Das Spiel konnte nicht erstellt werden.
      </p>
      <p class="hinweis">${escapeHtml(error.message)}</p>
      <button onclick="showStartseite()">Zurück</button>
    `;

    return;
  }

  currentLobby = lobby;

  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("host", lobby.code);

  history.pushState({}, "", url);

  showHostLobby(lobby.code);
}


// ==========================================
// LOBBY AUF DEM TABLET ANZEIGEN
// ==========================================

async function showHostLobby(code) {
  stopRealtime();

  app.classList.add("lobby-screen");

  app.innerHTML = `
    <div class="lobby-layout">

      <section class="qr-section">
        <p class="untertitel">SPIELZENTRALE</p>
        <h1>Deine Lobby</h1>

        <p class="beschreibung">
          Scanne den QR-Code mit deinem Smartphone,
          um dem Spiel beizutreten.
        </p>

        <div id="qrcode"></div>

        <p class="hinweis">ODER GIB DEN SPIELCODE EIN</p>
        <div class="game-code">${escapeHtml(code)}</div>
      </section>

      <section class="players-section">
        <p class="untertitel">DEINE SPIELRUNDE</p>
        <h2>Spieler</h2>

        <div id="player-list" class="player-list">
          <p class="hinweis">Warte auf Spieler ...</p>
        </div>

        <p id="host-status" class="hinweis">
          Sobald Spieler beitreten, erscheinen sie hier.
        </p>
      </section>

    </div>
  `;

  // QR-Code für die Smartphones erstellen
  const joinUrl = new URL(location.href);
  joinUrl.search = "";
  joinUrl.searchParams.set("join", code);

  new QRCode(document.querySelector("#qrcode"), {
    text: joinUrl.toString(),
    width: 220,
    height: 220,
    colorDark: "#10131c",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });

  // Bestehende Lobby laden
  const { data, error } = await db
    .from("game_lobbies")
    .select("*")
    .eq("code", code)
    .single();

  if (error) {
    console.error(error);
    setMessage("Die Lobby konnte nicht geladen werden.");
    return;
  }

  currentLobby = data;
  renderHostLobby(data.players || [], data.status || "waiting");

  // Änderungen live empfangen
  currentChannel = db
    .channel("lobby-" + code)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "game_lobbies",
        filter: "code=eq." + code
      },
      payload => {
        currentLobby = payload.new;

        renderHostLobby(
          payload.new.players || [],
          payload.new.status || "waiting"
        );
      }
    )
    .subscribe();
}


// ==========================================
// SPIELERLISTE AUF DEM TABLET AKTUALISIEREN
// ==========================================

function renderHostLobby(players, status) {
  const list = document.querySelector("#player-list");
  const statusText = document.querySelector("#host-status");

  if (!list) return;

  if (status === "started") {
    list.innerHTML = `
      <div class="waiting-box">
        <h2>Das Spiel beginnt!</h2>
        <p>Die Spieler sind bereit.</p>
      </div>
    `;

    if (statusText) {
      statusText.textContent = "Spiel gestartet";
    }

    return;
  }

  if (!players.length) {
    list.innerHTML = `
      <p class="hinweis">Noch keine Spieler beigetreten.</p>
    `;
  } else {
    list.innerHTML = players.map((player, index) => `
      <div class="player-item">
        <span>${index + 1}. ${escapeHtml(player.name)}</span>
        ${
          player.isHost
            ? '<span class="host-label">SPIELLEITER</span>'
            : ""
        }
      </div>
    `).join("");
  }

  if (statusText) {
    statusText.textContent =
      players.length + (players.length === 1 ? " Spieler" : " Spieler") +
      " in der Lobby";
  }
}


// ==========================================
// SMARTPHONE: LOBBY BEITRETEN
// ==========================================

function showJoinPage(code) {
  stopRealtime();

  app.classList.remove("lobby-screen");

  app.innerHTML = `
    <div class="logo">♫</div>

    <p class="untertitel">DU BIST DABEI</p>
    <h1>Spiel beitreten</h1>

    <p class="beschreibung">
      Gib deinen Namen ein, damit dich die anderen Spieler erkennen.
    </p>

    <label for="player-name">Dein Spielername</label>

    <input
      id="player-name"
      type="text"
      placeholder="Dein Name"
      maxlength="20"
      autocomplete="nickname"
    >

    <button id="join-game">Spiel beitreten</button>

    <p id="lobby-message" class="hinweis"></p>
  `;

  document.querySelector("#join-game")
    .addEventListener("click", () => joinGame(code));

  document.querySelector("#player-name")
    .addEventListener("keydown", event => {
      if (event.key === "Enter") {
        joinGame(code);
      }
    });
}


// ==========================================
// SPIELER IN SUPABASE EINTRAGEN
// ==========================================

async function joinGame(code) {
  const nameInput = document.querySelector("#player-name");
  const name = nameInput.value.trim();

  if (!name) {
    setMessage("Bitte gib zuerst deinen Namen ein.");
    nameInput.focus();
    return;
  }

  const joinButton = document.querySelector("#join-game");
  joinButton.disabled = true;
  joinButton.textContent = "Beitritt läuft ...";

  try {
    const { data: lobby, error: loadError } = await db
      .from("game_lobbies")
      .select("*")
      .eq("code", code)
      .single();

    if (loadError || !lobby) {
      throw new Error("Diese Lobby wurde nicht gefunden.");
    }

    if (lobby.status === "started") {
      throw new Error("Das Spiel hat bereits begonnen.");
    }

    const playerId = getPlayerId();
    const players = lobby.players || [];

    // Prüfen, ob dieses Smartphone bereits beigetreten ist
    const existingPlayer = players.find(player => player.id === playerId);

    if (existingPlayer) {
      currentPlayer = existingPlayer;
      currentLobby = lobby;
      showJoinedPage(code);
      return;
    }

    // Der erste Spieler wird automatisch Spielleiter
    const isFirstPlayer = players.length === 0;

    const newPlayer = {
      id: playerId,
      name: name,
      isHost: isFirstPlayer
    };

    players.push(newPlayer);

    const { data: updatedLobby, error: updateError } = await db
      .from("game_lobbies")
      .update({ players: players })
      .eq("id", lobby.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    currentPlayer = newPlayer;
    currentLobby = updatedLobby;

    showJoinedPage(code);

  } catch (error) {
    console.error(error);

    setMessage(error.message);

    joinButton.disabled = false;
    joinButton.textContent = "Spiel beitreten";
  }
}


// ==========================================
// SMARTPHONE: ERFOLGREICH BEIGETRETEN
// ==========================================

function showJoinedPage(code) {
  app.classList.remove("lobby-screen");

  const isHost = currentPlayer && currentPlayer.isHost;

  app.innerHTML = `
    <div class="logo">♫</div>

    <p class="untertitel">DU BIST DABEI</p>

    <h1>Hallo, ${escapeHtml(currentPlayer.name)}!</h1>

    ${
      isHost
        ? `
          <div class="waiting-box">
            <h2>Du bist Spieler 1</h2>
            <p>Du bist der Spielleiter und kannst die Runde starten.</p>
          </div>

          <button id="start-game">Spiel starten</button>
        `
        : `
          <div class="waiting-box">
            <h2>Warte auf den Spielstart</h2>
            <p>Der Spielleiter startet das Spiel, sobald alle bereit sind.</p>
          </div>
        `
    }

    <button id="leave-game" class="secondary">
      Lobby verlassen
    </button>
  `;

  if (isHost) {
    document.querySelector("#start-game")
      .addEventListener("click", () => startGame(code));
  }

  document.querySelector("#leave-game")
    .addEventListener("click", () => leaveLobby(code));
}


// ==========================================
// SPIEL STARTEN – NUR SPIELLEITER
// ==========================================

async function startGame(code) {
  if (!currentPlayer || !currentPlayer.isHost) {
    return;
  }

  const button = document.querySelector("#start-game");

  if (button) {
    button.disabled = true;
    button.textContent = "Spiel startet ...";
  }

  const { error } = await db
    .from("game_lobbies")
    .update({ status: "started" })
    .eq("code", code);

  if (error) {
    console.error(error);
    alert("Das Spiel konnte nicht gestartet werden.");

    if (button) {
      button.disabled = false;
      button.textContent = "Spiel starten";
    }
  }
}


// ==========================================
// LOBBY VERLASSEN
// ==========================================

async function leaveLobby(code) {
  if (!currentPlayer || !currentLobby) {
    return;
  }

  const { data: lobby, error: loadError } = await db
    .from("game_lobbies")
    .select("*")
    .eq("code", code)
    .single();

  if (loadError || !lobby) {
    showStartseite();
    return;
  }

  let players = (lobby.players || []).filter(
    player => player.id !== currentPlayer.id
  );

  // Wenn der Spielleiter geht, übernimmt der nächste Spieler
  if (players.length > 0 && !players.some(player => player.isHost)) {
    players = players.map((player, index) => ({
      ...player,
      isHost: index === 0
    }));
  }

  const { error } = await db
    .from("game_lobbies")
    .update({ players: players })
    .eq("id", lobby.id);

  if (error) {
    console.error(error);
    alert("Die Lobby konnte nicht verlassen werden.");
    return;
  }

  currentPlayer = null;
  currentLobby = null;

  const url = new URL(location.href);
  url.search = "";
  history.pushState({}, "", url);

  showStartseite();
}


// ==========================================
// SEITE ANHAND DER URL ÖFFNEN
// ==========================================

function initializeApp() {
  const params = new URLSearchParams(location.search);

  const hostCode = params.get("host");
  const joinCode = params.get("join");

  if (hostCode) {
    showHostLobby(hostCode);
  } else if (joinCode) {
    showJoinPage(joinCode);
  } else {
    showStartseite();
  }
}

initializeApp();
