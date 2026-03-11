export class HUD {
  constructor(root) {
    this.root = root;

    this.overlay = document.createElement('div');
    this.overlay.className = 'ui-overlay';

    this.menu = document.createElement('div');
    this.menu.className = 'menu';
    this.menu.innerHTML = `
      <div class="menu-card">
        <h1>Ruinfall: Dino Siege</h1>
        <div class="subtitle">Post-collapse combat insertion - district 7 deadzone</div>
        <div class="columns">
          <div class="panel">
            <h2>Controls</h2>
            <div>WASD Move</div>
            <div>Mouse Aim</div>
            <div>Left Click Fire</div>
            <div>R Reload</div>
            <div>Shift Sprint</div>
            <div>Ctrl/C Crouch</div>
            <div>Space Jump</div>
            <div>Esc Pause</div>
          </div>
          <div class="panel">
            <h2>Mission</h2>
            <div>Drop into the city, survive waves, and reach extraction beacon.</div>
            <div>Eliminate apex predators and hold for extraction timer.</div>
            <div>Collect ammo and med packs scattered around wreckage zones.</div>
          </div>
        </div>
        <div class="asset-status" id="assetStatus">Initializing drop systems...</div>
        <button id="startButton">Deploy</button>
      </div>
    `;

    this.pausePanel = this.makePanel('Paused', 'Mission clock halted.');
    this.pausePanel.classList.add('hidden');
    this.failPanel = this.makePanel('Mission Failed', 'You were overwhelmed in the deadzone.');
    this.failPanel.classList.add('hidden');
    this.winPanel = this.makePanel('Extraction Success', 'Dropship inbound. District sweep complete.');
    this.winPanel.classList.add('hidden');

    this.hud = document.createElement('div');
    this.hud.className = 'hud hidden';
    this.hud.innerHTML = `
      <div class="hud-scan"></div>
      <div class="hud-vignette"></div>
      <div class="hud-frame tl"></div>
      <div class="hud-frame tr"></div>
      <div class="hud-frame bl"></div>
      <div class="hud-frame br"></div>

      <div class="telemetry-strip">
        <div class="telemetry-block">
          <div class="telemetry-label">Heading</div>
          <div class="telemetry-value" id="headingLine">000</div>
        </div>
        <div class="telemetry-block">
          <div class="telemetry-label">Extraction</div>
          <div class="telemetry-value" id="extractLine">0m</div>
        </div>
        <div class="telemetry-block">
          <div class="telemetry-label">Threat Level</div>
          <div class="telemetry-value" id="threatLevelLine">LOW</div>
        </div>
      </div>

      <div class="crosshair"></div>
      <div class="objective" id="objectiveText"></div>
      <div class="intro-caption" id="introCaption"></div>

      <div class="status-bar">
        <div class="status-line">
          <div class="status-top">
            <span>Vital</span>
            <span id="healthLine">HP 100</span>
          </div>
          <div class="meter"><div class="meter-fill health" id="healthFill"></div></div>
        </div>
        <div class="status-line">
          <div class="status-top">
            <span>Weapon</span>
            <span id="ammoLine">AMMO 12 / 36</span>
          </div>
          <div class="meter"><div class="meter-fill ammo" id="ammoFill"></div></div>
        </div>
        <div class="status-line" id="threatLine">THREATS 0</div>
        <div class="status-line" id="scoreLine">SCORE 0</div>
      </div>

      <div class="weapon-panel">
        <div class="weapon-title">Pulse Carbine MK-IV</div>
        <div class="weapon-mode">Mode: Auto Burst</div>
        <div class="weapon-state" id="weaponState">Combat Ready</div>
      </div>

      <canvas class="minimap" id="minimap" width="180" height="180"></canvas>
      <div class="hit-overlay" id="hitOverlay"></div>
    `;

    this.overlay.append(this.menu, this.pausePanel, this.failPanel, this.winPanel, this.hud);
    this.root.appendChild(this.overlay);

    this.healthLine = this.hud.querySelector('#healthLine');
    this.ammoLine = this.hud.querySelector('#ammoLine');
    this.threatLine = this.hud.querySelector('#threatLine');
    this.scoreLine = this.hud.querySelector('#scoreLine');
    this.headingLine = this.hud.querySelector('#headingLine');
    this.extractLine = this.hud.querySelector('#extractLine');
    this.threatLevelLine = this.hud.querySelector('#threatLevelLine');
    this.healthFill = this.hud.querySelector('#healthFill');
    this.ammoFill = this.hud.querySelector('#ammoFill');
    this.weaponState = this.hud.querySelector('#weaponState');
    this.objectiveText = this.hud.querySelector('#objectiveText');
    this.introCaption = this.hud.querySelector('#introCaption');
    this.hitOverlay = this.hud.querySelector('#hitOverlay');

    this.minimap = this.hud.querySelector('#minimap');
    this.minimapCtx = this.minimap.getContext('2d');

    this.startButton = this.menu.querySelector('#startButton');
    this.assetStatus = this.menu.querySelector('#assetStatus');
  }

  makePanel(title, subtitle) {
    const wrap = document.createElement('div');
    wrap.className = 'pause-panel';
    wrap.innerHTML = `
      <div class="panel-card">
        <h2>${title}</h2>
        <div>${subtitle}</div>
        <button class="restartBtn">Restart</button>
      </div>
    `;
    return wrap;
  }

  setMenuVisible(v) {
    this.menu.classList.toggle('hidden', !v);
  }

  setHudVisible(v) {
    this.hud.classList.toggle('hidden', !v);
  }

  setPauseVisible(v) {
    this.pausePanel.classList.toggle('hidden', !v);
  }

  setFailVisible(v) {
    this.failPanel.classList.toggle('hidden', !v);
  }

  setWinVisible(v) {
    this.winPanel.classList.toggle('hidden', !v);
  }

  onStart(cb) {
    this.startButton.addEventListener('click', cb);
  }

  onRestart(cb) {
    this.pausePanel.querySelector('.restartBtn').addEventListener('click', cb);
    this.failPanel.querySelector('.restartBtn').addEventListener('click', cb);
    this.winPanel.querySelector('.restartBtn').addEventListener('click', cb);
  }

  setStartEnabled(enabled) {
    this.startButton.disabled = !enabled;
    this.startButton.style.opacity = enabled ? '1' : '0.5';
    this.startButton.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }

  setAssetStatus(text) {
    this.assetStatus.textContent = text;
  }

  update(stats) {
    const hp = Math.max(0, Math.floor(stats.health));
    this.healthLine.textContent = `HP ${hp}`;
    this.healthLine.style.color = hp < 30 ? '#ff7a6b' : '#d8ffea';
    this.ammoLine.textContent = `AMMO ${stats.ammoInClip} / ${stats.reserveAmmo}${stats.reloading ? ' RELOADING' : ''}`;
    this.threatLine.textContent = `THREATS ${stats.threats}`;
    this.scoreLine.textContent = `SCORE ${stats.score}`;
    this.headingLine.textContent = `${stats.heading.toString().padStart(3, '0')} DEG`;
    this.extractLine.textContent = `${Math.floor(stats.extractionDistance)}M`;
    this.threatLevelLine.textContent = stats.threats > 8 ? 'CRITICAL' : stats.threats > 4 ? 'HIGH' : 'ELEVATED';
    this.healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;

    const ammoPct = stats.maxClipAmmo > 0 ? (stats.ammoInClip / stats.maxClipAmmo) * 100 : 0;
    this.ammoFill.style.width = `${Math.max(0, Math.min(100, ammoPct))}%`;
    this.weaponState.textContent = stats.reloading ? 'Cycling Magazine' : 'Combat Ready';
    this.objectiveText.textContent = stats.objective;
  }

  pulseHit() {
    this.hitOverlay.style.opacity = '1';
    setTimeout(() => {
      this.hitOverlay.style.opacity = '0';
    }, 70);
  }

  drawMinimap(playerPos, enemies) {
    const ctx = this.minimapCtx;
    const w = this.minimap.width;
    const h = this.minimap.height;
    const scale = 0.2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(8, 14, 18, 0.85)';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(140, 190, 255, 0.2)';
    ctx.strokeRect(1, 1, w - 2, h - 2);

    const px = w / 2;
    const py = h / 2;

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = (enemy.mesh.position.x - playerPos.x) * scale;
      const dy = (enemy.mesh.position.z - playerPos.z) * scale;
      if (Math.abs(dx) > w / 2 || Math.abs(dy) > h / 2) continue;
      ctx.fillStyle = enemy.typeName === 'apex' ? '#ff6f5f' : enemy.typeName === 'mauler' ? '#f9b46e' : '#b9ff8a';
      ctx.beginPath();
      ctx.arc(px + dx, py + dy, enemy.typeName === 'apex' ? 3.5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#86d8ff';
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
