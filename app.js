const createGameButton = document.querySelector("#create-game");
const startseite = document.querySelector(".startseite");

createGameButton.addEventListener("click", () => {
  startseite.innerHTML = `
    <div class="logo">♫</div>
    <p class="untertitel">NEUES SPIEL</p>
    <h1>Lobby</h1>
    <p class="beschreibung">
      Das ist zunächst eine lokale Test-Lobby auf diesem Gerät.
    </p>

    <label for="player-name">Spielername</label>
    <input
      id="player-name"
      type="text"
      placeholder="Dein Name"
      maxlength="20"
    >

    <button id="join-game">Spiel beitreten</button>
    <p id="lobby-message" class="hinweis"></p>
    <button id="back-button" class="secondary">Zurück</button>
  `;

  document.querySelector("#join-game").addEventListener("click", () => {
    const nameInput = document.querySelector("#player-name");
    const name = nameInput.value.trim();
    const message = document.querySelector("#lobby-message");

    if (!name) {
      message.textContent = "Bitte gib zuerst einen Spielernamen ein.";
      nameInput.focus();
      return;
    }

    startseite.innerHTML = `
      <div class="logo">♫</div>
      <p class="untertitel">LOKALES TESTSPIEL</p>
      <h1>Willkommen, ${escapeHtml(name)}!</h1>
      <p class="beschreibung">
        Du bist der erste Spieler. Als Nächstes bauen wir die Zeitleiste
        und den Spielzug mit einem Song ein.
      </p>
      <button id="back-button" class="secondary">Zurück zur Startseite</button>
    `;

    document.querySelector("#back-button").addEventListener("click", showStartseite);
  });

  document.querySelector("#back-button").addEventListener("click", showStartseite);
});

function showStartseite() {
  location.reload();
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (character) => {
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
