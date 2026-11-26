
// ==========================================
// HITSTER DIGITAL – SPIELVERBINDUNG
// ==========================================

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

  return "player-" + Date.now() + "-" +
    Math.random().toString(16).slice(2);
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

function stopRealtime() {
  if (currentChannel) {
    db.removeChannel(currentChannel);
    currentChannel = null;
  }
}

function showStartseite() {
  stopRealtime();

  currentPlayer = null;
  currentLobby = null;

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

    if (error) throw error;

    currentLobby = data;

    const url = new URL(location.href);
    url.search = "";
    url.searchParams.set("host", code);
    history.pushState({}, "", url);

    showHostLobby(code);

  } catch (error) {
    console.error(error);

    app.innerHTML = `
      <h1>Fehler</h1>
      <p class="beschreibung">
        Das Spiel konnte nicht erstellt werden.
      </p>
      <p class="hinweis">${escapeHtml(error.message)}</p>
      <button id="back-home">Zurück</button>
    `;

    document.querySelector("#back-home")
      .addEventListener("click", showStartseite);
  }
}


// ==========================================
// LOBBY AUF DEM TABLET
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
        <p class="untertitel">SPIELRUNDE</p>
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

  const { data, error } = await db
    .from("game_lobbies")
    .select("*")
    .eq("code", code)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  currentLobby = data;
  renderHostLobby(data.players || [], data.status || "waiting");

  currentChannel = db
    .channel("tablet-lobby-" + code)
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
// SPIELERLISTE AUF DEM TABLET
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
// SMARTPHONE: BEITRITTSSEITE
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
      if (event.key === "Enter") joinGame(code);
    });
}


// ==========================================
// SPIELER BEITRETEN
// ==========================================

async function joinGame(code) {
  const nameInput = document.querySelector("#player-name");
  const name = nameInput.value.trim();

  if (!name) {
    document.querySelector("#lobby-message").textContent =
      "Bitte gib zuerst deinen Namen ein.";
    nameInput.focus();
    return;
  }

  const button = document.querySelector("#join-game");
  button.disabled = true;
  button.textContent = "Beitritt läuft ...";

  try {
    const { data: lobby, error } = await db
      .from("game_lobbies")
      .select("*")
      .eq("code", code)
      .single();

    if (error || !lobby) {
      throw new Error("Diese Lobby wurde nicht gefunden.");
    }

    if (lobby.status === "started") {
      throw new Error("Das Spiel hat bereits begonnen.");
    }

    const playerId = getPlayerId();
    const players = lobby.players || [];

    const existingPlayer = players.find(
      player => player.id === playerId
    );

    if (existingPlayer) {
      currentPlayer = existingPlayer;
      currentLobby = lobby;
      showJoinedPage(code);
      return;
    }

    const newPlayer = {
      id: playerId,
      name: name,
      isHost: players.length === 0
    };

    players.push(newPlayer);

    const { data: updatedLobby, error: updateError } = await db
      .from("game_lobbies")
      .update({ players: players })
      .eq("id", lobby.id)
      .select()
      .single();

    if (updateError) throw updateError;

    currentPlayer = newPlayer;
    currentLobby = updatedLobby;

    showJoinedPage(code);

  } catch (error) {
    console.error(error);

    const message = document.querySelector("#lobby-message");
    if (message) message.textContent = error.message;

    button.disabled = false;
    button.textContent = "Spiel beitreten";
  }
}


// ==========================================
// SMARTPHONE: LOBBY-ANSICHT
// ==========================================

function showJoinedPage(code) {
  stopRealtime();

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

  // Änderungen der Lobby auf diesem Smartphone empfangen
  currentChannel = db
    .channel("phone-lobby-" + code + "-" + currentPlayer.id)
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

        const players = payload.new.players || [];

        const updatedPlayer = players.find(
          player => player.id === currentPlayer.id
        );

        // Spieler wurde aus der Lobby entfernt
        if (!updatedPlayer) {
          showRemovedPage();
          return;
        }

        // Spielleiterstatus aktualisieren
        currentPlayer = updatedPlayer;

        // Alle Smartphones wechseln gleichzeitig zum Spiel
        if (payload.new.status === "started") {
          showGameScreen(code);
          return;
        }

        // Bei einem Spielleiterwechsel Ansicht aktualisieren
        if (updatedPlayer.isHost !== isHost) {
          showJoinedPage(code);
        }
      }
    )
    .subscribe();
}


// ==========================================
// SPIELSTART AUF DEM SMARTPHONE
// ==========================================

async function startGame(code) {
  if (!currentPlayer || !currentPlayer.isHost) return;

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
// SPIELANSICHT – VORLÄUFIG
// ==========================================

function showGameScreen(code) {
  stopRealtime();

  app.classList.remove("lobby-screen");

  app.innerHTML = `
    <div class="logo">♫</div>
    <p class="untertitel">HITSTER DIGITAL</p>
    <h1>Das Spiel beginnt!</h1>

    <div class="waiting-box">
      <h2>Hallo, ${escapeHtml(currentPlayer.name)}!</h2>
      <p>
        Du bist jetzt im Spiel.
        Als Nächstes bauen wir die Spielzüge und die Zeitleiste ein.
      </p>
    </div>

    <p class="hinweis">Spielcode: ${escapeHtml(code)}</p>
  `;
}


// ==========================================
// SPIELER VERLÄSST DIE LOBBY
// ==========================================

async function leaveLobby(code) {
  if (!currentPlayer || !currentLobby) return;

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

  // Wenn der Spielleiter geht, übernimmt der erste verbleibende Spieler
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

  const url = new URL(location.href);
  url.search = "";
  history.pushState({}, "", url);

  showStartseite();
}


// ==========================================
// WENN EIN SPIELER ENTFERNT WURDE
// ==========================================

function showRemovedPage() {
  stopRealtime();

  currentPlayer = null;
  currentLobby = null;

  app.classList.remove("lobby-screen");

  app.innerHTML = `
    <div class="logo">♫</div>
    <h1>Lobby verlassen</h1>
    <p class="beschreibung">
      Du bist nicht mehr Teil dieser Spielrunde.
    </p>
    <button id="back-home">Zur Startseite</button>
  `;

  document.querySelector("#back-home")
    .addEventListener("click", showStartseite);
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
