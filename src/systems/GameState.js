export const GamePhase = {
  MENU: 'menu',
  INTRO: 'intro',
  PLAYING: 'playing',
  PAUSED: 'paused',
  WON: 'won',
  LOST: 'lost'
};

export class GameState {
  constructor() {
    this.phase = GamePhase.MENU;
    this.health = 100;
    this.score = 0;
    this.extractionTimer = 60;
    this.apexKills = 0;
    this.kills = 0;
    this.objective = 'Prepare for deployment';
  }

  reset() {
    this.phase = GamePhase.MENU;
    this.health = 100;
    this.score = 0;
    this.extractionTimer = 60;
    this.apexKills = 0;
    this.kills = 0;
    this.objective = 'Prepare for deployment';
  }

  applyDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    return this.health;
  }

  heal(amount) {
    this.health = Math.min(100, this.health + amount);
  }

  addKill(score, type) {
    this.score += score;
    this.kills += 1;
    if (type === 'apex') this.apexKills += 1;
  }

  updateObjective() {
    if (this.phase === GamePhase.INTRO) {
      this.objective = 'Insertion underway';
      return;
    }
    if (this.phase === GamePhase.PLAYING) {
      if (this.apexKills < 2) {
        this.objective = `Eliminate apex threats (${this.apexKills}/2)`;
      } else {
        this.objective = `Reach beacon and hold ${Math.ceil(this.extractionTimer)}s`;
      }
    }
  }
}
