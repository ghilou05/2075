import "./hud.css";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createHud(root) {
  root.innerHTML = `
    <div class="bars">
      <div class="bar"><span>YOU</span><div class="fill" id="hp-player"></div></div>
      <div class="bar enemy"><span>ENEMY</span><div class="fill" id="hp-enemy"></div></div>
    </div>
    <div id="round"></div>
    <div id="subtitle"></div>
    <div id="flash"></div>
    <div id="overlay"><h1></h1><p></p><button></button></div>`;

  const $ = (s) => root.querySelector(s);
  const overlay = $("#overlay"), flashEl = $("#flash"), sub = $("#subtitle");
  let subTimer;

  return {
    setHealth(player, enemy, max = 100) {
      $("#hp-player").style.width = `${(player / max) * 100}%`;
      $("#hp-enemy").style.width = `${(enemy / max) * 100}%`;
    },
    setRound(text) { $("#round").textContent = text; },
    showSubtitle(text, ms = 3000) {
      sub.textContent = text;
      clearTimeout(subTimer);
      subTimer = setTimeout(() => (sub.textContent = ""), ms);
    },
    flash(kind) { // "hit" | "block" | "dodge"
      flashEl.className = kind;
      requestAnimationFrame(() => requestAnimationFrame(() => (flashEl.className = "")));
    },
    // Message with an optional button. Returns a promise that resolves on click.
    showMessage(title, text = "", buttonLabel = null) {
      overlay.style.display = "flex";
      overlay.querySelector("h1").textContent = title;
      overlay.querySelector("p").textContent = text;
      const btn = overlay.querySelector("button");
      btn.style.display = buttonLabel ? "block" : "none";
      btn.textContent = buttonLabel ?? "";
      if (!buttonLabel) return Promise.resolve();
      return new Promise((res) => (btn.onclick = () => res()));
    },
    hideMessage() { overlay.style.display = "none"; },
    sleep,
  };
}

// Call this synchronously inside the Start button's click handler
export async function unlockAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();
  window.__audioCtx = ctx;
}