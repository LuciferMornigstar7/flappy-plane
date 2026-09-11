(() => {
  const BEST_KEY = "flappyPlane911Best";
  const W = 480;
  const H = 800;
  const PX = 4;
  const GROUND = 128;
  const PLAY_TOP = 0;
  const PLAY_BOT = H - GROUND;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreBox = document.getElementById("scoreBox");
  const overlay = document.getElementById("overlay");
  const overEl = document.getElementById("over");
  const overScore = document.getElementById("overScore");
  const overBest = document.getElementById("overBest");
  const overKicker = document.getElementById("overKicker");
  const medalEl = document.getElementById("medal");

  const img = { up: null, mid: null, down: null, skyline: null, ground: null };

  let ac = null;
  function audioCtx() {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, dur, type, gain, slide) {
    try {
      const a = audioCtx();
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
      g.gain.setValueAtTime(gain ?? 0.07, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(g).connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur + 0.02);
    } catch (_) {}
  }
  function noiseBurst() {
    try {
      const a = audioCtx();
      const n = a.createBuffer(1, a.sampleRate * 0.28, a.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6);
      const s = a.createBufferSource();
      const g = a.createGain();
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 700;
      s.buffer = n;
      g.gain.setValueAtTime(0.2, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.28);
      s.connect(f).connect(g).connect(a.destination);
      s.start();
    } catch (_) {}
  }
  const sfx = {
    flap: () => { tone(620, 0.08, "square", 0.05, 320); },
    score: () => { tone(880, 0.07, "square", 0.06); setTimeout(() => tone(1175, 0.1, "square", 0.05), 70); },
    crash: () => {
      noiseBurst();
      tone(90, 0.5, "sawtooth", 0.12, 40);
      setTimeout(() => tone(220, 0.18, "square", 0.06, 80), 40);
      setTimeout(() => tone(70, 0.35, "triangle", 0.08, 30), 90);
    },
  };

  function load(src) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("fail " + src));
      i.src = src;
    });
  }

  function fitCanvas() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  const state = {
    mode: "ready",
    t: 0,
    birdY: 360,
    birdVy: 0,
    pipes: [],
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    speed: 2.7,
    gap: 196,
    groundX: 0,
    skyX: 0,
    shake: 0,
    flash: 0,
    deadTimer: 0,
    flapFrame: 1,
    boom: null,
  };

  const BIRD = { x: 86, w: 128, h: 68, hitW: 100, hitH: 44 };
  const PIPE_W = 78;
  const PIPE_SPACING = 270;

  function snap(v) { return Math.round(v / PX) * PX; }

  function resetRun(keepReady) {
    state.birdY = 360;
    state.birdVy = 0;
    state.pipes = [];
    state.score = 0;
    state.speed = 2.7;
    state.gap = 196;
    state.groundX = 0;
    state.skyX = 0;
    state.shake = 0;
    state.flash = 0;
    state.deadTimer = 0;
    state.flapFrame = 1;
    state.boom = null;
    state.mode = keepReady ? "ready" : "play";
    scoreBox.textContent = "0";
    if (keepReady) {
      scoreBox.classList.remove("on");
      overlay.classList.remove("hide");
      overlay.classList.add("show");
      overEl.classList.add("hide");
      state.pipes = [
        { x: 300, gapY: 350, scored: false },
        { x: 300 + PIPE_SPACING, gapY: 300, scored: false },
      ];
    } else {
      scoreBox.classList.add("on");
      overlay.classList.add("hide");
      overEl.classList.add("hide");
      spawnPipe(W - 16);
      spawnPipe(W - 16 + PIPE_SPACING);
      spawnPipe(W - 16 + PIPE_SPACING * 2);
    }
  }

  function spawnPipe(x) {
    const minCenter = 90 + state.gap / 2;
    const maxCenter = PLAY_BOT - 90 - state.gap / 2;
    const gapY = minCenter + Math.random() * (maxCenter - minCenter);
    state.pipes.push({ x, gapY, scored: false });
  }

  function startPlay() {
    state.mode = "play";
    scoreBox.textContent = String(state.score);
    scoreBox.classList.add("on");
    overlay.classList.add("hide");
    overEl.classList.add("hide");
    state.birdVy = -8.2;
    sfx.flap();
  }

  function flap() {
    if (state.mode === "ready") { startPlay(); return; }
    if (state.mode === "dead") {
      if (state.deadTimer > 0.85) {
        resetRun(false);
        state.birdVy = -8.2;
        sfx.flap();
      }
      return;
    }
    state.birdVy = -8.2;
    sfx.flap();
  }

  function planeAngle() {
    if (state.mode === "ready") return 0;
    return Math.max(-0.5, Math.min(0.9, state.birdVy * 0.075));
  }

  function planePoints() {
    const ang = planeAngle();
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const cx = BIRD.x + BIRD.w * 0.55;
    const cy = state.birdY;
    const locals = [
      [0.12, 0.00], [0.30, 0.00], [0.50, 0.00], [0.70, 0.00], [0.88, 0.00],
      [0.62, -0.28], [0.62, 0.28], [0.78, -0.18], [0.78, 0.18],
      [0.20, -0.22], [0.20, 0.22], [0.45, -0.30], [0.45, 0.30],
    ];
    return locals.map(([ux, uy]) => {
      const lx = (ux - 0.55) * BIRD.w;
      const ly = uy * BIRD.h;
      return { x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos };
    });
  }

  function pointInRect(pt, r) {
    return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
  }

  function birdHitbox() {
    return {
      x: BIRD.x + 6,
      y: state.birdY - BIRD.h / 2 + 6,
      w: BIRD.w - 12,
      h: BIRD.h - 12,
    };
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function hitsWorld() {
    const hit = birdHitbox();
    if (hit.y <= 2) return true;
    if (hit.y + hit.h >= PLAY_BOT - 2) return true;
    const pts = planePoints();
    for (const p of state.pipes) {
      const gapTop = p.gapY - state.gap / 2;
      const gapBot = p.gapY + state.gap / 2;
      const topRect = { x: p.x - 6, y: -40, w: PIPE_W + 12, h: gapTop + 40 };
      const botRect = { x: p.x - 6, y: gapBot, w: PIPE_W + 12, h: PLAY_BOT - gapBot + 20 };
      if (rectsOverlap(hit, topRect) || rectsOverlap(hit, botRect)) return true;
      for (const pt of pts) {
        if (pointInRect(pt, topRect) || pointInRect(pt, botRect)) return true;
      }
    }
    return false;
  }

  function spawnBoom(x, y) {
    const sparks = [];
    const bits = [];
    const pal = ["#fff4c2", "#ff9f1c", "#e71d36", "#ffd93d", "#6d2b0a", "#2b2b2b"];
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 7;
      sparks.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 2,
        life: 0.45 + Math.random() * 0.55,
        max: 0.45 + Math.random() * 0.55,
        size: PX * (1 + (i % 3)),
        color: pal[i % pal.length],
      });
    }
    const wreck = ["#f4f7ff", "#c0392b", "#2980b9", "#d4a574", "#1a1a1a", "#f4f7ff", "#c0392b"];
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 5.5;
      bits.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 3,
        w: PX * (2 + (i % 4)),
        h: PX * (1 + (i % 3)),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: wreck[i % wreck.length],
        life: 1.1 + Math.random() * 0.5,
      });
    }
    return {
      x, y, t: 0,
      sparks, bits,
      kufi: { x, y, vx: -2.2, vy: -6.5, rot: 0, vr: -0.18, life: 1.4 },
    };
  }

  function die() {
    if (state.mode !== "play") return;
    state.mode = "dead";
    state.deadTimer = 0;
    state.shake = 18;
    state.flash = 0.85;
    state.boom = spawnBoom(BIRD.x + BIRD.w * 0.62, state.birdY);
    startTowerDrop(state.boom.x);
    sfx.crash();
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
    }
    overScore.textContent = String(state.score);
    overBest.textContent = String(state.best);
    overKicker.textContent = state.score === 0 ? "KABOOM" : state.score >= 11 ? "CLEARED" : "KABOOM";
    medalEl.className = "medal";
    if (state.score >= 50) medalEl.classList.add("legend");
    else if (state.score >= 25) medalEl.classList.add("gold");
    else if (state.score >= 10) medalEl.classList.add("silver");
    else if (state.score >= 5) medalEl.classList.add("bronze");
    setTimeout(() => overEl.classList.remove("hide"), 1300);
  }

  function startTowerDrop(boomX) {
    for (const p of state.pipes) {
      const cx = p.x + PIPE_W / 2;
      const dir = cx < boomX ? -1 : 1;
      p.fall = {
        delay: Math.min(0.28, Math.abs(cx - boomX) / 900),
        topY: 0,
        topVy: 0.8,
        topRot: 0,
        topVr: dir * (0.012 + Math.random() * 0.02),
        topLanded: false,
        botY: 0,
        botVy: 0.4,
        botRot: 0,
        botVr: dir * (0.018 + Math.random() * 0.025),
        botLanded: false,
      };
    }
  }

  function update(dt) {
    const f = dt * 60;
    state.t += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 28);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 1.8);
    if (state.mode !== "dead") {
      state.flapFrame = 1;
    }

    const scrolling = state.mode === "play";
    const spd = scrolling ? state.speed : 0;

    if (state.mode === "ready") {
      state.birdY = 360 + Math.sin(state.t * 3.1) * 8;
      state.groundX -= 1.4 * f;
      state.skyX -= 0.3 * f;
    }

    if (state.mode === "play") {
      state.birdVy = Math.min(14, state.birdVy + 0.48 * f);
      state.birdY += state.birdVy * f;
      if (state.birdY - BIRD.hitH / 2 <= 2) {
        state.birdY = 2 + BIRD.hitH / 2;
        die();
      }
    }

    if (scrolling) {
      state.groundX -= spd * f;
      state.skyX -= spd * 0.22 * f;
      for (const p of state.pipes) p.x -= spd * f;
      while (state.pipes.length && state.pipes[0].x + PIPE_W < -40) state.pipes.shift();
      const last = state.pipes[state.pipes.length - 1];
      if (last && last.x < W - PIPE_SPACING) spawnPipe(last.x + PIPE_SPACING);

      for (const p of state.pipes) {
        if (!p.scored && p.x + PIPE_W < BIRD.x) {
          p.scored = true;
          state.score += 1;
          scoreBox.textContent = String(state.score);
          sfx.score();
          if (state.score % 8 === 0) {
            state.speed = Math.min(4.3, state.speed + 0.14);
            state.gap = Math.max(160, state.gap - 4);
          }
        }
      }
      if (hitsWorld()) die();
    }

    if (state.mode === "play" && hitsWorld()) die();
    if (state.mode === "dead") {
      state.deadTimer += dt;
      updateBoom(dt, f);
      updateTowerDrop(dt, f);
    }
  }

  function puffDust(x, y, n) {
    if (!state.boom) return;
    const gray = ["#6e767e", "#9aa3ab", "#3a3330", "#c5c0b0"];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.15 - Math.random() * Math.PI * 0.7;
      const sp = 1 + Math.random() * 4;
      state.boom.sparks.push({
        x: x + (Math.random() - 0.5) * 30,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 0.4 + Math.random() * 0.5,
        max: 0.9,
        size: PX * (1 + (i % 3)),
        color: gray[i % gray.length],
      });
    }
  }

  function updateTowerDrop(dt, f) {
    for (const p of state.pipes) {
      const fall = p.fall;
      if (!fall) continue;
      if (state.deadTimer < fall.delay) continue;

      const gapTop = p.gapY - state.gap / 2;
      const gapBot = p.gapY + state.gap / 2;
      const topH = Math.max(8, gapTop + 8);
      const botH = PLAY_BOT - gapBot + 8;
      const topY0 = PLAY_TOP - 8;
      const botY0 = gapBot;

      fall.topVy += 0.62 * f;
      fall.topY += fall.topVy * f;
      fall.topRot += fall.topVr * f;
      const topBottom = topY0 + topH + fall.topY;
      if (topBottom >= PLAY_BOT - 2) {
        fall.topY = PLAY_BOT - 2 - topH - topY0;
        if (!fall.topLanded) {
          fall.topLanded = true;
          puffDust(p.x + PIPE_W / 2, PLAY_BOT - 6, 10);
        }
        fall.topVy = 0;
        fall.topVr *= 0.7;
      }

      fall.botVy += 0.5 * f;
      fall.botY += fall.botVy * f;
      fall.botRot += fall.botVr * f;
      if (Math.abs(fall.botRot) > 1.15) {
        fall.botRot = Math.sign(fall.botRot) * 1.15;
        fall.botVr = 0;
      }
      const botBottom = botY0 + botH + fall.botY;
      if (botBottom >= PLAY_BOT + 28) {
        fall.botY = PLAY_BOT + 28 - botH - botY0;
        if (!fall.botLanded) {
          fall.botLanded = true;
          puffDust(p.x + PIPE_W / 2, PLAY_BOT - 6, 8);
        }
        fall.botVy = 0;
      }
    }
  }

  function updateBoom(dt, f) {
    const b = state.boom;
    if (!b) return;
    b.t += dt;
    for (const s of b.sparks) {
      s.x += s.vx * f;
      s.y += s.vy * f;
      s.vy += 0.18 * f;
      s.life -= dt;
    }
    b.sparks = b.sparks.filter((s) => s.life > 0);
    for (const bit of b.bits) {
      bit.x += bit.vx * f;
      bit.y += bit.vy * f;
      bit.vy += 0.32 * f;
      bit.rot += bit.vr * f;
      bit.life -= dt * 0.7;
      if (bit.y > PLAY_BOT - 8) {
        bit.y = PLAY_BOT - 8;
        bit.vy *= -0.35;
        bit.vx *= 0.8;
      }
    }
    const k = b.kufi;
    k.x += k.vx * f;
    k.y += k.vy * f;
    k.vy += 0.28 * f;
    k.rot += k.vr * f;
    k.life -= dt * 0.55;
    if (k.y > PLAY_BOT - 10) {
      k.y = PLAY_BOT - 10;
      k.vy *= -0.25;
      k.vx *= 0.7;
    }
  }

  function fillPx(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(snap(x), snap(y), snap(w) || PX, snap(h) || PX);
  }

  function drawSky() {
    ctx.fillStyle = "#4EC0CA";
    ctx.fillRect(0, 0, W, PLAY_BOT);
  }

  function drawSkyline() {
    if (!img.skyline) return;
    const src = img.skyline;
    const destH = PLAY_BOT + 36;
    const destW = destH * (src.width / src.height);
    const y = 0;
    const off = ((state.skyX % destW) + destW) % destW;
    let x = -off;
    while (x < W) {
      ctx.drawImage(src, snap(x), snap(y), snap(destW), snap(destH));
      x += destW;
    }
  }

  function drawGround() {
    if (!img.ground) {
      fillPx(0, PLAY_BOT, W, GROUND, "#DED895");
      return;
    }
    const gimg = img.ground;
    const destH = GROUND + 8;
    const destW = destH * (gimg.width / gimg.height);
    const off = ((state.groundX % destW) + destW) % destW;
    let x = -off;
    while (x < W) {
      ctx.drawImage(gimg, snap(x), snap(PLAY_BOT - 8), snap(destW), snap(destH));
      x += destW;
    }
    fillPx(0, PLAY_BOT, W, PX, "#12100c");
  }

  function drawTower(x, y, w, h, capAtBottom) {
    if (h <= PX) return;
    x = snap(x); y = snap(y); w = snap(w); h = snap(h);
    const capH = 28;
    const capW = w + 12;
    const capX = x - 6;

    fillPx(x, y, w, h, "#12100c");
    fillPx(x + PX, y + PX, w - PX * 2, h - PX * 2, "#9AA3AB");
    fillPx(x + w - PX * 3, y + PX, PX * 2, h - PX * 2, "#6E767E");

    const win = PX * 2;
    const gap = PX * 2;
    for (let wy = y + PX * 3; wy < y + h - PX * 4; wy += win + gap) {
      for (let wx = x + PX * 3; wx < x + w - PX * 6; wx += win + PX) {
        fillPx(wx, wy, win, win, "#2B333A");
      }
    }

    if (capAtBottom) {
      const cy = y + h - capH;
      fillPx(capX, cy, capW, capH, "#12100c");
      fillPx(capX + PX, cy + PX, capW - PX * 2, capH - PX * 2, "#B7BEC4");
      fillPx(capX + PX, cy + capH - PX * 3, capW - PX * 2, PX, "#6E767E");
    } else {
      fillPx(capX, y, capW, capH, "#12100c");
      fillPx(capX + PX, y + PX, capW - PX * 2, capH - PX * 2, "#B7BEC4");
    }
  }

  function drawPipes() {
    for (const p of state.pipes) {
      const gapTop = p.gapY - state.gap / 2;
      const gapBot = p.gapY + state.gap / 2;
      const topH = Math.max(0, gapTop + 8);
      const botH = PLAY_BOT - gapBot + 8;
      const topY0 = PLAY_TOP - 8;
      const botY0 = gapBot;
      if (p.fall) {
        const fall = p.fall;
        ctx.save();
        ctx.translate(snap(p.x + PIPE_W / 2), snap(topY0 + topH / 2 + fall.topY));
        ctx.rotate(fall.topRot);
        drawTower(-PIPE_W / 2, -topH / 2, PIPE_W, topH, true);
        ctx.restore();
        ctx.save();
        ctx.translate(snap(p.x + PIPE_W / 2), snap(botY0 + botH / 2 + fall.botY));
        ctx.rotate(fall.botRot);
        drawTower(-PIPE_W / 2, -botH / 2, PIPE_W, botH, false);
        ctx.restore();
      } else {
        drawTower(p.x, topY0, PIPE_W, topH, true);
        drawTower(p.x, botY0, PIPE_W, botH, false);
      }
    }
  }

  function birdFrame() {
    const frames = [img.up, img.mid, img.down];
    return frames[state.flapFrame] || img.mid;
  }

  function drawBird() {
    if (state.mode === "dead") return;
    const spr = birdFrame();
    if (!spr) return;
    const ang = planeAngle();
    ctx.save();
    ctx.translate(snap(BIRD.x + BIRD.w * 0.55), snap(state.birdY));
    ctx.rotate(ang);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(spr, snap(-BIRD.w * 0.55), snap(-BIRD.h / 2), snap(BIRD.w), snap(BIRD.h));
    ctx.restore();
  }

  function drawBoom() {
    const b = state.boom;
    if (!b) return;
    const t = b.t;

    const grow = t < 0.12 ? 1 : Math.max(0, 1 - (t - 0.12) / 0.7);
    const fireR = 22 + 58 * grow;
    if (grow > 0.05) {
      const step = PX * 2;
      for (let oy = -fireR; oy <= fireR; oy += step) {
        for (let ox = -fireR; ox <= fireR; ox += step) {
          const d = Math.sqrt(ox * ox + oy * oy) / (fireR || 1);
          if (d > 1) continue;
          let c = "#3a1408";
          if (d < 0.2) c = "#fffef0";
          else if (d < 0.42) c = "#ffd93d";
          else if (d < 0.68) c = "#ff7a18";
          else if (d < 0.88) c = "#d62828";
          fillPx(b.x + ox, b.y + oy, step, step, c);
        }
      }
    }

    for (const s of b.sparks) {
      const a = Math.max(0, s.life / s.max);
      ctx.globalAlpha = a;
      fillPx(s.x, s.y, s.size, s.size, s.color);
    }
    ctx.globalAlpha = 1;

    for (const bit of b.bits) {
      if (bit.life <= 0) continue;
      ctx.save();
      ctx.translate(snap(bit.x), snap(bit.y));
      ctx.rotate(bit.rot);
      ctx.globalAlpha = Math.min(1, bit.life);
      fillPx(-bit.w / 2, -bit.h / 2, bit.w, bit.h, bit.color);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    const k = b.kufi;
    if (k.life > 0) {
      ctx.save();
      ctx.translate(snap(k.x), snap(k.y));
      ctx.rotate(k.rot);
      ctx.globalAlpha = Math.min(1, k.life);
      fillPx(-10, -8, 20, 16, "#12100c");
      fillPx(-8, -6, 16, 12, "#f4f7ff");
      fillPx(-8, 2, 16, 4, "#12100c");
      fillPx(-6, 4, 4, 4, "#f4f7ff");
      fillPx(2, 4, 4, 4, "#f4f7ff");
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    ctx.save();
    if (state.shake > 0) {
      ctx.translate(snap((Math.random() - 0.5) * state.shake), snap((Math.random() - 0.5) * state.shake));
    }
    ctx.imageSmoothingEnabled = false;
    drawSky();
    drawSkyline();
    drawPipes();
    drawBird();
    drawGround();
    drawBoom();
    if (state.flash > 0) {
      const a = state.flash;
      ctx.fillStyle = `rgba(255, 210, 80,${a * 0.85})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,255,255,${a * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  let last = 0;
  function loop(ts) {
    if (!last) last = ts;
    let dt = (ts - last) / 1000;
    last = ts;
    dt = Math.min(0.033, dt);
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  document.getElementById("stage").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    flap();
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      flap();
    }
  });
  window.addEventListener("resize", fitCanvas);

  Promise.all([
    load("assets/plane.png").then((i) => { img.up = img.mid = img.down = i; }),
    load("assets/skyline-pixel.png").then((i) => { img.skyline = i; }),
    load("assets/ground-pixel.png").then((i) => { img.ground = i; }),
  ]).then(() => {
    fitCanvas();
    resetRun(true);
    if (/[?&]demo\b/.test(location.search)) {
      setTimeout(() => setInterval(() => flap(), 430), 350);
    }
    if (/[?&]boom\b/.test(location.search)) {
      setTimeout(() => { startPlay(); setTimeout(() => die(), 420); }, 300);
    }
    if (/[?&]fall\b/.test(location.search)) {
      setTimeout(() => startPlay(), 200);
    }
    requestAnimationFrame(loop);
  }).catch((err) => {
    console.error(err);
    fitCanvas();
    resetRun(true);
    requestAnimationFrame(loop);
  });
})();
