
// ==========================================
// HITSTER DIGITAL – SPIELVERBINDUNG
// ==========================================

const SUPABASE_URL = "https://emxuwtoysqizvazvylyb.supabase.co";
const SUPABASE_KEY = "sb_publishable__9lNBaOjKcmpIPbwX9Kr9Q_WNeyoWGo";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.querySelector("#app");

let currentChannel = null;
let currentLobby = null;
let currentPlayer = null;
let currentView = "home";
let selectedCard = false;


// ==========================================
// HILFSFUNKTIONEN
// ==========================================

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID();

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
  return String(text ?? "").replace(/[&<>"']/g, character => {
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

function shuffleArray(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function stopRealtime() {
  if (currentChannel) {
    db.removeChannel(currentChannel);
    currentChannel = null;
  }
}

async function loadLobby(code) {
  const { data, error } = await db
    .from("game_lobbies")
    .select("*")
    .eq("code", code)
    .single();

  if (error) throw error;

  currentLobby = data;
  return data;
}

function subscribeToLobby(code) {
  stopRealtime();

  currentChannel = db
    .channel("game-" + code + "-" + getPlayerId())
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
        handleLobbyUpdate(code, payload.new);
      }
    )
    .subscribe();
}

function handleLobbyUpdate(code, lobby) {
  if (lobby.status === "started" || lobby.status === "finished") {
    if (currentPlayer) {
      if (currentView !== "phone-game") {
        showPhoneGameScreen(code);
      } else {
        renderPhoneGame();
      }
    } else {
      if (currentView !== "tablet-game") {
        showTabletGameScreen(code);
      } else {
        renderTabletGame();
      }
    }

    return;
  }

  if (currentView === "host-lobby") {
    renderHostLobby(lobby.players || [], lobby.status);
  }

  if (currentView === "phone-lobby" && currentPlayer) {
    const updatedPlayer = (lobby.players || []).find(
      player => player.id === currentPlayer.id
    );

    if (!updatedPlayer) {
      showRemovedPage();
      return;
    }

    const oldIsHost = currentPlayer.isHost;
    currentPlayer = updatedPlayer;

    if (oldIsHost !== updatedPlayer.isHost) {
      showJoinedPage(code);
    }
  }
}

function showStartseite() {
  stopRealtime();

  currentPlayer = null;
  currentLobby = null;
  currentView = "home";

  app.classList.remove("lobby-screen");
  app.classList.remove("game-screen");

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
// SPIEL ERSTELLEN
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
        code,
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
    showError(error.message);
  }
}

function showError(message) {
  app.innerHTML = `
    <h1>Fehler</h1>
    <p class="beschreibung">${escapeHtml(message)}</p>
    <button id="back-home">Zurück</button>
  `;

  document.querySelector("#back-home")
    .addEventListener("click", showStartseite);
}


// ==========================================
// TABLET – LOBBY
// ==========================================

async function showHostLobby(code) {
  stopRealtime();
  currentView = "host-lobby";

  app.classList.add("lobby-screen");
  app.classList.remove("game-screen");

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

  try {
    const lobby = await loadLobby(code);

    if (lobby.status === "started" || lobby.status === "finished") {
      showTabletGameScreen(code);
      return;
    }

    renderHostLobby(lobby.players || [], lobby.status);

    subscribeToLobby(code);
  } catch (error) {
    console.error(error);
    showError(error.message);
  }
}

function renderHostLobby(players, status) {
  const list = document.querySelector("#player-list");
  const statusText = document.querySelector("#host-status");

  if (!list) return;

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
// SMARTPHONE – BEITRITT
// ==========================================

function showJoinPage(code) {
  stopRealtime();
  currentView = "join-page";

  app.classList.remove("lobby-screen");
  app.classList.remove("game-screen");

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
    const lobby = await loadLobby(code);

    if (lobby.status !== "waiting") {
      throw new Error("Das Spiel hat bereits begonnen.");
    }

    const playerId = getPlayerId();
    const players = lobby.players || [];

    const existingPlayer = players.find(
      player => player.id === playerId
    );

    if (existingPlayer) {
      currentPlayer = existingPlayer;
      showJoinedPage(code);
      return;
    }

    const newPlayer = {
      id: playerId,
      name,
      isHost: players.length === 0
    };

    players.push(newPlayer);

    const { data: updatedLobby, error } = await db
      .from("game_lobbies")
      .update({ players })
      .eq("id", lobby.id)
      .select()
      .single();

    if (error) throw error;

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
// SMARTPHONE – LOBBY
// ==========================================

function showJoinedPage(code) {
  stopRealtime();
  currentView = "phone-lobby";

  app.classList.remove("lobby-screen");
  app.classList.remove("game-screen");

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

  subscribeToLobby(code);
}


// ==========================================
// SPIELSTART – KARTENSTAPEL ERSTELLEN
// ==========================================

async function startGame(code) {
  if (!currentPlayer || !currentPlayer.isHost) return;

  const button = document.querySelector("#start-game");

  if (button) {
    button.disabled = true;
    button.textContent = "Spiel startet ...";
  }

  try {
    const lobby = await loadLobby(code);
    const players = lobby.players || [];

    if (!players.length) {
      throw new Error("Es sind keine Spieler in der Lobby.");
    }

    if (!Array.isArray(window.songs) || window.songs.length < players.length + 1) {
      throw new Error("Die Songliste konnte nicht richtig geladen werden.");
    }

    // Songs mischen
    const deck = shuffleArray(window.songs);

    // Jeder Spieler erhält eine zufällige Startkarte
    const timelines = {};

    players.forEach(player => {
      timelines[player.id] = [deck.pop()];
    });

    // Erste Karte für den ersten Spielzug ziehen
    const firstCard = deck.pop();

    const currentCard = {
      song: firstCard,
      player_id: players[0].id,
      position: null,
      revealed: false,
      correct: null
    };

    const { error } = await db
      .from("game_lobbies")
      .update({
        status: "started",
        current_player_index: 0,
        timelines,
        current_card: currentCard,
        game_deck: deck,
        round_number: 1
      })
      .eq("code", code);

    if (error) throw error;

  } catch (error) {
    console.error(error);
    alert("Das Spiel konnte nicht gestartet werden: " + error.message);

    if (button) {
      button.disabled = false;
      button.textContent = "Spiel starten";
    }
  }
}


// ==========================================
// TABLET – SPIELANSICHT
// ==========================================


async function showTabletGameScreen(code) {
  stopRealtime();
  currentView = "tablet-game";
  currentPlayer = null;

  app.classList.remove("startseite");
  app.classList.remove("lobby-screen");
  app.classList.add("game-screen");

  try {
    await loadLobby(code);
    renderTabletGame();
    subscribeToLobby(code);
  } catch (error) {
    console.error(error);
    showError(error.message);
  }
}


function renderTabletGame() {
  const lobby = currentLobby;
  if (!lobby) return;

  const players = lobby.players || [];
  const timelines = lobby.timelines || {};
  const playerIndex = lobby.current_player_index || 0;
  const activePlayer = players[playerIndex];
  const currentCard = lobby.current_card;

  if (lobby.status === "finished") {
    app.innerHTML = `
      <div class="game-board">
        <p class="untertitel">HITSTER DIGITAL</p>
        <h1>Spiel beendet!</h1>
        <div class="waiting-box">
          <h2>Alle Karten wurden gespielt.</h2>
          <p>Vielen Dank fürs Mitspielen!</p>
        </div>
      </div>
    `;
    return;
  }

  if (!activePlayer) return;

  const timeline = timelines[activePlayer.id] || [];

  let resultHtml = "";

  if (currentCard && currentCard.revealed) {
    resultHtml = `
      <div class="reveal-panel ${currentCard.correct ? "correct" : "incorrect"}">
        <p class="untertitel">AUFGELÖST</p>
        <h2>${escapeHtml(currentCard.song.title)}</h2>
        <p>${escapeHtml(currentCard.song.artist)}</p>
        <div class="reveal-year">${currentCard.song.year}</div>
        <strong>
          ${currentCard.correct ? "Richtig eingeordnet!" : "Leider falsch eingeordnet"}
        </strong>
      </div>
    `;
  } else {
    resultHtml = `
      <div class="tablet-current-card">
        <div class="record-icon">♫</div>
        <h2>Neue Karte</h2>
        <p>Die Karte wird gerade eingeordnet.</p>
        ${
          currentCard && currentCard.position !== null
            ? '<span class="placed-label">Position ausgewählt</span>'
            : '<span class="placed-label">Warte auf die Platzierung ...</span>'
        }
      </div>
    `;
  }

  app.innerHTML = `
    <div class="game-board tablet-board">
      <header class="game-header">
        <div>
          <p class="untertitel">HITSTER DIGITAL</p>
          <h1>Spielrunde</h1>
        </div>
        <div class="round-label">RUNDE ${lobby.round_number || 1}</div>
      </header>

      <section class="tablet-player-list">
        ${players.map((player, index) => `
          <div class="tablet-player ${index === playerIndex ? "active" : ""}">
            <span>${escapeHtml(player.name)}</span>
            <strong>${(timelines[player.id] || []).length} Karten</strong>
          </div>
        `).join("")}
      </section>

      <section class="active-player-panel">
        <p class="untertitel">JETZT AM ZUG</p>
        <h2>${escapeHtml(activePlayer.name)}</h2>
        <p>Spieler ${playerIndex + 1} von ${players.length}</p>
      </section>

      ${resultHtml}

      <section class="tablet-timeline-section">
        <div class="section-heading">
          <h2>Zeitleiste von ${escapeHtml(activePlayer.name)}</h2>
          <span>${timeline.length} Karten</span>
        </div>

        <div class="timeline-horizontal">
          ${
            timeline.map((song, index) => `
              <div class="timeline-card">
              <span class="timeline-card-number">${index + 1}</span>
              <strong>${song.year}</strong>
                <span class="card-artist">${escapeHtml(song.artist)}</span>
                <span class="card-title">${escapeHtml(song.title)}</span>
                </div>
            `).join("")
          }
        </div>
      </section>

      
    </div>
  `;
}


// ==========================================
// SMARTPHONE – SPIELANSICHT
// ==========================================


async function showPhoneGameScreen(code) {
  stopRealtime();
  currentView = "phone-game";
  selectedCard = false;

  app.classList.remove("startseite");
  app.classList.remove("lobby-screen");
  app.classList.add("game-screen");

  try {
    await loadLobby(code);
    renderPhoneGame();
    subscribeToLobby(code);
  } catch (error) {
    console.error(error);
    showError(error.message);
  }
}


function renderPhoneGame() {
  const lobby = currentLobby;
  if (!lobby || !currentPlayer) return;

  const players = lobby.players || [];
  const timelines = lobby.timelines || {};
  const playerIndex = lobby.current_player_index || 0;
  const activePlayer = players[playerIndex];
  const isMyTurn = activePlayer && activePlayer.id === currentPlayer.id;
  const timeline = timelines[currentPlayer.id] || [];
  const currentCard = lobby.current_card;

  if (lobby.status === "finished") {
    app.innerHTML = `
      <div class="phone-game">
        <div class="logo">♫</div>
        <p class="untertitel">HITSTER DIGITAL</p>
        <h1>Spiel beendet!</h1>
        <p class="beschreibung">Vielen Dank fürs Mitspielen!</p>
      </div>
    `;
    return;
  }

  if (!activePlayer) return;

  let turnContent = "";

  if (currentCard && currentCard.revealed) {
    turnContent = `
      <div class="reveal-panel ${currentCard.correct ? "correct" : "incorrect"}">
        <p class="untertitel">AUFGELÖST</p>
        <h2>${escapeHtml(currentCard.song.title)}</h2>
        <p>${escapeHtml(currentCard.song.artist)}</p>
        <div class="reveal-year">${currentCard.song.year}</div>
        <strong>
          ${currentCard.correct ? "Richtig eingeordnet!" : "Leider falsch eingeordnet"}
        </strong>
      </div>

      ${
        currentPlayer.isHost
          ? '<button id="next-turn">Nächster Spieler</button>'
          : '<p class="waiting-note">Warte, bis der Spielleiter den nächsten Zug startet.</p>'
      }
    `;
  } else if (isMyTurn) {
    turnContent = `
      <div class="phone-turn-panel">
        <p class="untertitel">DEIN SPIELZUG</p>
        <h2>Neue Karte</h2>
        <p>Ordne die verdeckte Karte an der passenden Stelle ein.</p>

       <div class="new-game-card">
  <div class="record-icon">♫</div>
  <strong>Neue Karte</strong>
  <span>Wähle eine Lücke in deiner Zeitleiste</span>
</div>

        <p class="placement-help">
          ${
            currentCard && currentCard.position !== null
              ? "Position ausgewählt. Du kannst jetzt auflösen."
              : "Tippe auf die gewünschte Lücke in deiner Zeitleiste."
          }
        </p>

        <button id="resolve-card"
          ${!currentCard || currentCard.position === null ? "disabled" : ""}>
          Auflösen
        </button>
      </div>
    `;
  } else {
    turnContent = `
      <div class="waiting-box">
        <h2>${escapeHtml(activePlayer.name)} ist am Zug</h2>
        <p>Du bist als Nächstes dran. Deine Zeitleiste bleibt hier sichtbar.</p>
      </div>
    `;
  }

  app.innerHTML = `
    <div class="phone-game">
      <header class="phone-game-header">
        <div>
          <p class="untertitel">HITSTER DIGITAL</p>
          <h1>Deine Zeitleiste</h1>
        </div>
        <div class="round-label">RUNDE ${lobby.round_number || 1}</div>
      </header>

      <div class="phone-turn-status ${isMyTurn ? "my-turn" : ""}">
        ${
          isMyTurn
            ? "Du bist jetzt an der Reihe!"
            : "Am Zug: " + escapeHtml(activePlayer.name)
        }
      </div>

      ${turnContent}

      <section class="phone-timeline-section">
        <div class="section-heading">
          <h2>Deine Karten</h2>
          <span>${timeline.length} Karten</span>
        </div>

        <div class="timeline-vertical">
          ${
            isMyTurn && currentCard && !currentCard.revealed
              ? timeline.map((song, index) => `
                  ${renderTimelineSlot(index, currentCard.position)}
                  ${renderTimelineCard(song, index)}
                `).join("") +
                renderTimelineSlot(timeline.length, currentCard.position)
              : timeline.map((song, index) =>
                  renderTimelineCard(song, index)
                ).join("")
          }
        </div>
      </section>
    </div>
  `;

  attachPhoneGameEvents(lobby);
}


function renderTimelineCard(song, index) {
  return `
    <div class="phone-timeline-card">
      <span class="timeline-card-number">${index + 1}</span>
      <div>
        <strong class="card-year">${song.year}</strong>
        <span class="card-artist">${escapeHtml(song.artist)}</span>
        <span class="card-title">${escapeHtml(song.title)}</span>
      </div>
    </div>
  `;
}


function renderTimelineSlot(position, selectedPosition) {
  const isPlaced = selectedPosition === position;

  return `
    <button
      class="timeline-slot ${isPlaced ? "placed" : ""}"
      data-position="${position}"
      type="button"
    >
      ${isPlaced ? "✓ Ausgewählt" : "+"}
    </button>
  `;
}


// ==========================================
// SMARTPHONE – KARTE VERSCHIEBEN
// ==========================================

function attachPhoneGameEvents(lobby) {

  // Gewünschte Lücke direkt auswählen
  document.querySelectorAll(".timeline-slot").forEach(slot => {
    slot.addEventListener("click", () => {
      placeCardAt(Number(slot.dataset.position));
    });
  });

  // Karte auflösen
  const resolveButton = document.querySelector("#resolve-card");

  if (resolveButton) {
    resolveButton.addEventListener("click", resolveCard);
  }

  // Nächsten Spieler starten
  const nextButton = document.querySelector("#next-turn");

  if (nextButton) {
    nextButton.addEventListener("click", nextTurn);
  }
}

// ==========================================
// KARTE AUFLÖSEN UND PRÜFEN
// ==========================================

async function resolveCard() {
  if (!currentPlayer || !currentLobby) return;

  try {
    const lobby = await loadLobby(currentLobby.code);
    const players = lobby.players || [];
    const playerIndex = lobby.current_player_index || 0;
    const activePlayer = players[playerIndex];
    const card = lobby.current_card;

    if (!activePlayer || activePlayer.id !== currentPlayer.id) {
      return;
    }

    if (!card || card.position === null || card.revealed) {
      return;
    }

    const timelines = { ...(lobby.timelines || {}) };
    const timeline = [...(timelines[currentPlayer.id] || [])];
    const position = card.position;
    const year = Number(card.song.year);

    const previousSong = position > 0 ? timeline[position - 1] : null;
    const nextSong = position < timeline.length ? timeline[position] : null;

    const afterPrevious = !previousSong || year >= Number(previousSong.year);
    const beforeNext = !nextSong || year <= Number(nextSong.year);

    const correct = afterPrevious && beforeNext;

    if (correct) {
      timeline.splice(position, 0, card.song);
      timelines[currentPlayer.id] = timeline;
    }

    const updatedCard = {
      ...card,
      revealed: true,
      correct
    };

    const { error } = await db
      .from("game_lobbies")
      .update({
        timelines,
        current_card: updatedCard
      })
      .eq("code", lobby.code);

    if (error) throw error;

  } catch (error) {
    console.error(error);
    alert("Die Karte konnte nicht aufgelöst werden: " + error.message);
  }
}


// ==========================================
// NÄCHSTER SPIELER
// ==========================================

async function nextTurn() {
  if (!currentPlayer || !currentPlayer.isHost || !currentLobby) return;

  const button = document.querySelector("#next-turn");

  if (button) {
    button.disabled = true;
    button.textContent = "Nächster Zug ...";
  }

  try {
    const lobby = await loadLobby(currentLobby.code);
    const players = lobby.players || [];
    const deck = [...(lobby.game_deck || [])];

    if (!lobby.current_card || !lobby.current_card.revealed) {
      throw new Error("Die aktuelle Karte muss zuerst aufgelöst werden.");
    }

    if (!deck.length) {
      const { error } = await db
        .from("game_lobbies")
        .update({
          status: "finished",
          current_card: null
        })
        .eq("code", lobby.code);

      if (error) throw error;
      return;
    }

    const oldIndex = lobby.current_player_index || 0;
    const nextIndex = (oldIndex + 1) % players.length;
    const newRound = nextIndex === 0
      ? (lobby.round_number || 1) + 1
      : (lobby.round_number || 1);

    const nextCard = deck.pop();

    const currentCard = {
      song: nextCard,
      player_id: players[nextIndex].id,
      position: null,
      revealed: false,
      correct: null
    };

    const { error } = await db
      .from("game_lobbies")
      .update({
        current_player_index: nextIndex,
        round_number: newRound,
        game_deck: deck,
        current_card: currentCard
      })
      .eq("code", lobby.code);

    if (error) throw error;

  } catch (error) {
    console.error(error);
    alert("Der nächste Spielzug konnte nicht gestartet werden: " + error.message);

    if (button) {
      button.disabled = false;
      button.textContent = "Nächster Spieler";
    }
  }
}


// ==========================================
// LOBBY VERLASSEN
// ==========================================

async function leaveLobby(code) {
  if (!currentPlayer || !currentLobby) return;

  try {
    const lobby = await loadLobby(code);

    let players = (lobby.players || []).filter(
      player => player.id !== currentPlayer.id
    );

    if (players.length > 0 && !players.some(player => player.isHost)) {
      players = players.map((player, index) => ({
        ...player,
        isHost: index === 0
      }));
    }

    const { error } = await db
      .from("game_lobbies")
      .update({ players })
      .eq("id", lobby.id);

    if (error) throw error;

    const url = new URL(location.href);
    url.search = "";
    history.pushState({}, "", url);

    showStartseite();

  } catch (error) {
    console.error(error);
    alert("Die Lobby konnte nicht verlassen werden.");
  }
}


// ==========================================
// SPIELER WURDE ENTFERNT
// ==========================================

function showRemovedPage() {
  stopRealtime();

  currentPlayer = null;
  currentLobby = null;
  currentView = "removed";

  app.classList.remove("lobby-screen");
  app.classList.remove("game-screen");

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


async function openJoinLink(code) {
  try {
    const lobby = await loadLobby(code);
    const playerId = getPlayerId();

    const existingPlayer = (lobby.players || []).find(
      player => player.id === playerId
    );

    if (
      existingPlayer &&
      (lobby.status === "started" || lobby.status === "finished")
    ) {
      currentPlayer = existingPlayer;
      showPhoneGameScreen(code);
    } else {
      showJoinPage(code);
    }
  } catch (error) {
    console.error(error);
    showError(error.message);
  }
}

function initializeApp() {
  const params = new URLSearchParams(location.search);

  const hostCode = params.get("host");
  const joinCode = params.get("join");

  if (hostCode) {
    showHostLobby(hostCode);
  } else if (joinCode) {
    openJoinLink(joinCode);
  } else {
    showStartseite();
  }
}

initializeApp();

