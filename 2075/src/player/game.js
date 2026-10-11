import { unlockAudio } from "./hud.js";

export const GAME = {
  MAX_HP: 100,
  PUNCH_DMG: 8,                                  // your punch on the enemy
  ENEMY_DMG: { jab: 8, hook: 12, uppercut: 15 }, // must match B's move names
  DEFAULT_DMG: 10,
  BLOCK_REDUCTION: 0.8,       // blocked hits do 20% damage
  BLOCK_GRACE_MS: 150,        // a block counts if you were guarding this recently
  ATTACK_GAP_MS: [1800, 3200],
  ROUNDS_TO_WIN: 2,
  ROUND_PAUSE_MS: 2500,
};

export function createGame({ enemy, moves, hud, chooseMove, onEvent = () => {} }) {
  const moveNames = Object.keys(GAME.ENEMY_DMG);
  const pick = chooseMove ?? (() => moveNames[Math.floor(Math.random() * moveNames.length)]);

  const g = {
    phase: "idle", // idle | calibrating | fighting | roundOver | matchOver
    playerHp: GAME.MAX_HP, enemyHp: GAME.MAX_HP,
    round: 1, wins: { player: 0, enemy: 0 },
    stats: { punches: { left: 0, right: 0 }, strikesFaced: 0, blocked: 0, dodged: 0, hit: 0 },
  };
  let attackTimer = null;
  let lastBlockT = -Infinity;

  // Person B reads this to build the AI prompt
  function getFightState() {
    const s = g.stats, l = s.punches.left, r = s.punches.right;
    return {
      playerHp: g.playerHp, enemyHp: g.enemyHp, round: g.round,
      blockRate: s.strikesFaced ? s.blocked / s.strikesFaced : 0,
      dodgeRate: s.strikesFaced ? s.dodged / s.strikesFaced : 0,
      favouredHand: l > r ? "left" : r > l ? "right" : "even",
    };
  }

  const refresh = () => {
    hud.setHealth(g.playerHp, g.enemyHp, GAME.MAX_HP);
    hud.setRound(`ROUND ${g.round}   ·   ${g.wins.player} - ${g.wins.enemy}`);
  };

  function scheduleAttack() {
    if (g.phase !== "fighting") return;
    const [lo, hi] = GAME.ATTACK_GAP_MS;
    attackTimer = setTimeout(() => {
      if (g.phase !== "fighting") return;
      enemy.playMove(pick(getFightState()));
      scheduleAttack();
    }, lo + Math.random() * (hi - lo));
  }

  // Enemy punch is landing NOW
  function handleStrike({ move } = {}) {
    if (g.phase !== "fighting") return;
    const s = g.stats;
    let dmg = GAME.ENEMY_DMG[move] ?? GAME.DEFAULT_DMG;
    let result;

    if (performance.now() - lastBlockT <= GAME.BLOCK_GRACE_MS) {
      result = "blocked"; s.blocked++;
      dmg = Math.round(dmg * (1 - GAME.BLOCK_REDUCTION));
    } else if (moves.state.dodge) {
      result = "dodged"; s.dodged++; dmg = 0;
    } else {
      result = "hit"; s.hit++;
    }
    s.strikesFaced++;
    hud.flash(result === "blocked" ? "block" : result === "dodged" ? "dodge" : "hit");

    g.playerHp = Math.max(0, g.playerHp - dmg);
    refresh();
    onEvent("strike-result", { result, move, dmg, ...getFightState() });
    if (g.playerHp <= 0) endRound("enemy");
  }

  function handlePunch({ hand }) {
    if (g.phase !== "fighting") return;
    g.stats.punches[hand]++;
    enemy.takeHit();
    g.enemyHp = Math.max(0, g.enemyHp - GAME.PUNCH_DMG);
    refresh();
    onEvent("player-punch", { hand, ...getFightState() });
    if (g.enemyHp <= 0) endRound("player");
  }

  async function endRound(winner) {
    g.phase = "roundOver";
    clearTimeout(attackTimer);
    g.wins[winner]++;
    refresh();
    onEvent("round-end", { winner, ...getFightState(), wins: { ...g.wins } });

    if (g.wins[winner] >= GAME.ROUNDS_TO_WIN) {
      g.phase = "matchOver";
      onEvent("match-end", { winner, wins: { ...g.wins } });
      await hud.showMessage(
        winner === "player" ? "YOU WIN" : "YOU LOSE",
        `${g.wins.player} - ${g.wins.enemy}`,
        "Play again"
      );
      begin();
      return;
    }
    hud.showMessage(winner === "player" ? "Round won" : "Round lost", "Get ready…");
    await hud.sleep(GAME.ROUND_PAUSE_MS);
    g.round++;
    startRound();
  }

  async function startRound() {
    g.playerHp = GAME.MAX_HP; g.enemyHp = GAME.MAX_HP;
    g.phase = "roundOver"; // frozen during the announcement
    refresh();
    hud.showMessage(`ROUND ${g.round}`, "FIGHT!");
    await hud.sleep(1200);
    hud.hideMessage();
    g.phase = "fighting";
    scheduleAttack();
  }

  // Call every frame, after moves.update()
  function tick(now) {
    if (moves.state.blocking) lastBlockT = now;
  }

  async function begin() {
    g.phase = "calibrating";
    g.round = 1; g.wins = { player: 0, enemy: 0 };
    g.stats = { punches: { left: 0, right: 0 }, strikesFaced: 0, blocked: 0, dodged: 0, hit: 0 };
    for (let i = 3; i > 0; i--) {
      hud.showMessage("Get in your guard stance", String(i));
      await hud.sleep(1000);
    }
    hud.showMessage("Hold still…");
    moves.startCalibration();
    while (!moves.state.calibrated) await hud.sleep(50); // waits until you're in frame
    startRound();
  }

  async function start() {
    refresh();
    const click = hud.showMessage("2075", "Stand back so your upper body is in frame", "Start");
    await unlockAudio(); // must run inside the click gesture; if it errors, move this into the button handler
    await click;
    begin();
  }

  enemy.onStrike(handleStrike);
  return { start, tick, handlePunch, getFightState, state: g };
}