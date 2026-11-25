/* =========================================================
   守夜 / NIGHTWATCH
   canvas surveillance feed + WebAudio horror engine
   ========================================================= */

(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var map = function (v, a, b) { return clamp((v - a) / (b - a), 0, 1); };
  var ease = function (t) { return t * t * (3 - 2 * t); };
  var rand = function (a, b) { return a + Math.random() * (b - a); };

  // a refresh must not drop you back into the middle of the story
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  var QS = new URLSearchParams(location.search);
  var STATIC = QS.has('static');
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FORCE_Y = null;

  /* -------------------------------------------------------
     state
     ------------------------------------------------------- */
  var S = {
    y: 0, lastY: 0, vh: innerHeight, vw: innerWidth,
    maxY: 1, p: 0, maxP: 0,
    act: 1, maxAct: 1,
    fp: 0, feedT: 0,
    started: Date.now(), idle: 0,
    fired: {}, endDone: false, gateBack: false,
    naked: false
  };

  var el = {
    body: document.body,
    site: $('#site'),
    finale: $('#finale'),
    gate: $('#gate'),
    flash: $('#flash'),
    scare: $('#scare-cv'),
    blackout: $('#blackout'),
    feedA: $('#feedA'),
    feedB: $('#feedB'),
    feedC: $('#feedC'),
    feedSec: $('#feed'),
    nav: $('#nav'),
    sound: $('#sound'),
    soundLabel: $('#sound-label'),
    camTs: $('#cam-ts'),
    finTs: $('#fin-ts'),
    heroTs: $('#hero-ts'),
    againTs: $('#again-ts'),
    againCam: $('#again-cam'),
    oppress: $('#oppress'),
    feedNote: $('#feed-note')
  };

  /* =========================================================
     CANVAS FEED
     ========================================================= */

  function makeNoise(n) {
    var c = document.createElement('canvas');
    c.width = c.height = n;
    var x = c.getContext('2d');
    var img = x.createImageData(n, n);
    for (var i = 0; i < img.data.length; i += 4) {
      var v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  var NOISE = makeNoise(128);

  function drawFigure(x, cx, floorY, size) {
    var headR = size * 0.075;
    var headY = floorY - size + headR;
    var shoulderY = headY + headR * 1.95;
    var hipY = floorY - size * 0.47;
    var sw = size * 0.18;
    var hw = size * 0.115;

    x.fillStyle = '#000';

    // head
    x.beginPath();
    x.ellipse(cx, headY, headR * 0.88, headR * 1.05, 0, 0, Math.PI * 2);
    x.fill();

    // neck
    x.fillRect(cx - headR * 0.4, headY + headR * 0.55, headR * 0.8, headR * 1.6);

    // one silhouette: shoulders, arms hanging, waist, legs
    x.beginPath();
    x.moveTo(cx - sw * 0.30, shoulderY - size * 0.012);
    x.quadraticCurveTo(cx - sw * 0.72, shoulderY - size * 0.024, cx - sw, shoulderY + size * 0.022);
    x.lineTo(cx - sw * 0.94, shoulderY + size * 0.30);
    x.lineTo(cx - hw * 1.16, hipY);
    x.lineTo(cx - hw * 1.02, hipY + size * 0.03);
    x.lineTo(cx - hw * 0.52, floorY);
    x.lineTo(cx - hw * 0.06, floorY);
    x.lineTo(cx - hw * 0.02, hipY + size * 0.055);
    x.lineTo(cx + hw * 0.02, hipY + size * 0.055);
    x.lineTo(cx + hw * 0.06, floorY);
    x.lineTo(cx + hw * 0.52, floorY);
    x.lineTo(cx + hw * 1.02, hipY + size * 0.03);
    x.lineTo(cx + hw * 1.16, hipY);
    x.lineTo(cx + sw * 0.94, shoulderY + size * 0.30);
    x.lineTo(cx + sw, shoulderY + size * 0.022);
    x.quadraticCurveTo(cx + sw * 0.72, shoulderY - size * 0.024, cx + sw * 0.30, shoulderY - size * 0.012);
    x.closePath();
    x.fill();
  }

  function Feed(cv, opts) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.o = opts || {};
    this.w = 0; this.h = 0;
    this.z = 0;
    this.fig = 0;
    this.glitch = 0;
    this.dim = 0;
    this.t = 0;
    this.vig = null;
    this.resize();
  }

  Feed.prototype.resize = function () {
    if (!this.cv) return;
    var r = this.cv.getBoundingClientRect();
    var sc = this.o.scale || 0.55;
    var w = Math.round((r.width || 640) * sc);
    var h = Math.round((r.height || 360) * sc);
    w = clamp(w, 320, 900);
    h = clamp(h, 180, 560);
    if (w !== this.cv.width || h !== this.cv.height) {
      this.cv.width = w;
      this.cv.height = h;
      this.vig = null;
    }
    this.w = w; this.h = h;
  };

  Feed.prototype.draw = function (dt) {
    var x = this.ctx, w = this.w, h = this.h;
    if (!x || !w || !h) return;
    this.t += dt;

    var vx = w * 0.5;
    var vy = h * 0.52;

    // room
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d282c');
    g.addColorStop(0.55, '#161f22');
    g.addColorStop(1, '#0b1113');
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);

    // floor plane
    x.beginPath();
    x.moveTo(-w * 0.1, h * 1.02);
    x.lineTo(vx - w * 0.05, vy);
    x.lineTo(vx + w * 0.05, vy);
    x.lineTo(w * 1.1, h * 1.02);
    x.closePath();
    var fg = x.createLinearGradient(0, vy, 0, h);
    fg.addColorStop(0, '#2a3539');
    fg.addColorStop(1, '#111719');
    x.fillStyle = fg;
    x.fill();

    // perspective seams
    x.strokeStyle = 'rgba(180,205,210,.07)';
    x.lineWidth = 1;
    for (var i = 1; i <= 7; i++) {
      var t = i / 8;
      var span = w * (0.03 + t * 0.85);
      x.beginPath(); x.moveTo(vx, vy); x.lineTo(vx - span, h * 1.02); x.stroke();
      x.beginPath(); x.moveTo(vx, vy); x.lineTo(vx + span, h * 1.02); x.stroke();
    }

    // ceiling edge
    x.strokeStyle = 'rgba(180,205,210,.06)';
    x.beginPath(); x.moveTo(0, h * 0.13); x.lineTo(vx - w * 0.05, vy); x.lineTo(vx + w * 0.05, vy); x.lineTo(w, h * 0.13); x.stroke();

    // light spilling from the doorway
    var lg = x.createRadialGradient(vx, vy, 0, vx, vy, h * 0.55);
    lg.addColorStop(0, 'rgba(150,190,200,.10)');
    lg.addColorStop(1, 'rgba(150,190,200,0)');
    x.fillStyle = lg;
    x.fillRect(0, 0, w, h);

    // doorway at the end of the hall — the only thing lit in the flat
    var dw = w * 0.145, dh = h * 0.34;
    var dg = x.createLinearGradient(0, vy - dh, 0, vy);
    dg.addColorStop(0, '#39474a');
    dg.addColorStop(0.7, '#222c2e');
    dg.addColorStop(1, '#0c1112');
    x.fillStyle = dg;
    x.fillRect(vx - dw / 2, vy - dh, dw, dh);
    x.strokeStyle = 'rgba(190,215,220,.16)';
    x.lineWidth = 1;
    x.strokeRect(vx - dw / 2, vy - dh, dw, dh);

    // the one standing in it
    if (this.fig > 0.002) {
      var size = (h * 0.16) / (1 - clamp(this.z, 0, 0.985));
      var floorY = lerp(vy, h * 1.16, clamp(this.z * 1.25, 0, 1));
      x.globalAlpha = clamp(this.fig, 0, 1);
      drawFigure(x, vx, floorY, size);
      x.globalAlpha = 1;
    }

    // grain
    if (!this.pat) this.pat = x.createPattern(NOISE, 'repeat');
    x.save();
    x.globalAlpha = 0.085 + this.glitch * 0.3;
    x.translate(-((Math.random() * 128) | 0), -((Math.random() * 128) | 0));
    x.fillStyle = this.pat;
    x.fillRect(0, 0, w + 130, h + 130);
    x.restore();

    // rolling scan band
    var by = ((this.t * 0.055) % 1.2 - 0.1) * h;
    var bg = x.createLinearGradient(0, by - h * 0.12, 0, by + h * 0.12);
    bg.addColorStop(0, 'rgba(200,225,235,0)');
    bg.addColorStop(0.5, 'rgba(200,225,235,.035)');
    bg.addColorStop(1, 'rgba(200,225,235,0)');
    x.fillStyle = bg;
    x.fillRect(0, by - h * 0.12, w, h * 0.24);

    // glitch slices
    if (this.glitch > 0.01) {
      for (var k = 0; k < 5; k++) {
        var sy = Math.random() * h;
        var sh = h * rand(0.01, 0.06);
        var dx = rand(-1, 1) * w * 0.04 * this.glitch;
        try { x.drawImage(this.cv, 0, sy, w, sh, dx, sy, w, sh); } catch (e) { }
      }
      x.fillStyle = 'rgba(255,255,255,' + (this.glitch * 0.04) + ')';
      x.fillRect(0, 0, w, h);
    }

    // vignette
    if (!this.vig) {
      var vg = x.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.74);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(0.62, 'rgba(0,0,0,.34)');
      vg.addColorStop(1, 'rgba(0,0,0,.86)');
      this.vig = vg;
    }
    x.fillStyle = this.vig;
    x.fillRect(0, 0, w, h);

    if (this.dim > 0) {
      x.fillStyle = 'rgba(0,0,0,' + clamp(this.dim, 0, 1).toFixed(3) + ')';
      x.fillRect(0, 0, w, h);
    }
  };

  var feedA = el.feedA ? new Feed(el.feedA, { scale: 0.6 }) : null;
  var feedB = el.feedB ? new Feed(el.feedB, { scale: 0.62 }) : null;
  var feedC = el.feedC ? new Feed(el.feedC, { scale: 0.6 }) : null;

  /* =========================================================
     AUDIO
     ========================================================= */

  var A = {
    ctx: null, master: null, on: true, built: false,
    tension: 0, level: 0, duckUntil: 0, punchUntil: 0, hbOn: false,

    init: function (ctxOverride) {
      if (this.built && !ctxOverride) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!ctxOverride && !AC) return false;
      var c = this.ctx = ctxOverride || new AC();

      var comp = c.createDynamicsCompressor();
      comp.threshold.value = -9;
      comp.knee.value = 6;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      var lim = c.createDynamicsCompressor();
      lim.threshold.value = -6;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.002;
      lim.release.value = 0.12;
      comp.connect(lim);
      lim.connect(c.destination);
      this.comp = comp;

      var m = this.master = c.createGain();
      m.gain.value = 0.0001;   // silent until you scroll
      m.connect(comp);

      // --- layer 1: sub. headphones only; laptop speakers can't do this
      this.lp = c.createBiquadFilter();
      this.lp.type = 'lowpass';
      this.lp.frequency.value = 150;
      this.lp.Q.value = 4;
      this.lp.connect(m);

      var dg = this.droneGain = c.createGain();
      dg.gain.value = 0.10;
      dg.connect(this.lp);

      [41.4, 42.1, 82.9].forEach(function (f, i) {
        var o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = rand(-6, 6);
        var g = c.createGain();
        g.gain.value = i === 2 ? 0.12 : 0.2;
        o.connect(g); g.connect(dg); o.start();
        var lfo = c.createOscillator();
        lfo.frequency.value = 0.03 + i * 0.017;
        var lg = c.createGain();
        lg.gain.value = 4;
        lfo.connect(lg); lg.connect(o.detune); lfo.start();
      });

      var sub = c.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = 27.5;
      var sg = c.createGain();
      sg.gain.value = 0.05;
      sub.connect(sg); sg.connect(m); sub.start();

      // --- layer 2: body. this is the part you can actually hear on a laptop
      var bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 320;
      bp.Q.value = 0.9;
      bp.connect(m);

      this.bodyGain = c.createGain();
      this.bodyGain.gain.value = 0.2;
      this.bodyGain.connect(bp);

      [186.4, 248.1, 296.7, 352.3].forEach(function (f, i) {
        var o = c.createOscillator();
        o.type = i % 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        o.detune.value = rand(-9, 9);
        var g = c.createGain();
        g.gain.value = 0.1 / (1 + i * 0.35);
        o.connect(g); g.connect(bp); o.start();
        var lfo = c.createOscillator();
        lfo.frequency.value = 0.05 + i * 0.023;
        var lg = c.createGain();
        lg.gain.value = 7;
        lfo.connect(lg); lg.connect(o.detune); lfo.start();
      });

      // --- layer 3: air. a hiss that sits above everything, so it reads on any speaker
      this.airBuf = this.makeNoiseBuf(5, 'white');   // white: brown has nothing left at 3kHz
      var air = c.createBufferSource();
      air.buffer = this.airBuf;
      air.loop = true;
      var ahp = c.createBiquadFilter();
      ahp.type = 'highpass'; ahp.frequency.value = 900;
      var ab = c.createBiquadFilter();
      ab.type = 'bandpass'; ab.frequency.value = 2400; ab.Q.value = 0.55;
      var ag = this.airGain = c.createGain();
      ag.gain.value = 0.16;
      air.connect(ahp); ahp.connect(ab); ab.connect(ag); ag.connect(m); air.start();

      // breathing
      var bl = c.createOscillator();
      bl.frequency.value = 0.115;
      var bg = c.createGain();
      bg.gain.value = 0.04;
      bl.connect(bg); bg.connect(ag.gain); bl.start();

      // --- layer 4: a low wind under the body, keeps laptops from sounding thin
      var wind = c.createBufferSource();
      wind.buffer = this.airBuf;
      wind.loop = true;
      var wb = c.createBiquadFilter();
      wb.type = 'bandpass'; wb.frequency.value = 700; wb.Q.value = 0.8;
      this.windGain = c.createGain();
      this.windGain.gain.value = 0.18;
      wind.connect(wb); wb.connect(this.windGain); this.windGain.connect(m);
      wind.start();
      var wl = c.createOscillator();
      wl.frequency.value = 0.07;
      var wlg = c.createGain();
      wlg.gain.value = 0.05;
      wl.connect(wlg); wlg.connect(this.windGain.gain); wl.start();

      this.built = true;
      this.heart();
      return true;
    },

    applyGain: function () {
      if (!this.ctx) return;
      var c = this.ctx, now = c.currentTime, g, tc = 0.6;
      if (!this.on) g = 0.0001;
      else if (now < this.punchUntil) { g = 1.0; tc = 0.008; }
      else if (now < this.duckUntil) g = 0.0001;
      else if (this.level < 0.015) g = 0.0001;
      else g = 0.05 + 0.23 * Math.pow(this.level, 0.9);
      this.master.gain.setTargetAtTime(g, now, tc);

      var L = clamp(this.level, 0, 1);
      this.lp.frequency.setTargetAtTime(120 + L * 460, now, 0.7);
      if (this.bodyGain) this.bodyGain.gain.setTargetAtTime(0.05 + L * 0.34, now, 0.7);
      if (this.airGain) this.airGain.gain.setTargetAtTime(0.02 + L * 0.16, now, 0.7);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0.02 + L * 0.18, now, 0.7);
    },

    punch: function () {
      if (!this.ctx) return;
      this.punchUntil = this.ctx.currentTime + 1.1;
      this.applyGain();
      var self = this;
      setTimeout(function () { self.applyGain(); }, 1150);
    },

    setTension: function (t) {
      if (!this.built) { this.level = t; return; }
      this.tension = t;
      this.level = t;
      this.applyGain();
      var c = this.ctx;
      if (this.on && c.state === 'suspended') c.resume();
    },

    makeNoiseBuf: function (sec, kind) {
      var c = this.ctx;
      var len = Math.floor(c.sampleRate * sec);
      var buf = c.createBuffer(2, len, c.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch);
        var last = 0;
        for (var i = 0; i < len; i++) {
          var w = Math.random() * 2 - 1;
          if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
          else d[i] = w;
        }
      }
      return buf;
    },

    heart: function () {
      if (!this.built) return;
      var self = this;
      var t = this.tension;
      if (this.on && t > 0.36) {
        var now = this.ctx.currentTime;
        this.thump(now, 0.4 + t * 0.55);
        this.thump(now + 0.17, 0.22 + t * 0.4);
      }
      var period = lerp(1.5, 0.52, clamp(t, 0, 1));
      setTimeout(function () { self.heart(); }, period * 1000);
    },

    thump: function (when, amp) {
      var c = this.ctx;
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(82, when);
      o.frequency.exponentialRampToValueAtTime(27, when + 0.24);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.55 * amp, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.34);
      o.connect(g); g.connect(this.master);
      o.start(when); o.stop(when + 0.36);

      // the audible half of the beat: a soft body knock around 160 Hz
      var n = c.createBufferSource();
      n.buffer = this.makeNoiseBuf(0.2, 'white');
      var f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 165; f.Q.value = 2.2;
      var ng = c.createGain();
      ng.gain.setValueAtTime(0.0001, when);
      ng.gain.exponentialRampToValueAtTime(0.5 * amp, when + 0.008);
      ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      n.connect(f); f.connect(ng); ng.connect(this.master);
      n.start(when); n.stop(when + 0.2);
    },

    duck: function (ms) {
      if (!this.built) return;
      this.duckUntil = this.ctx.currentTime + ms / 1000;
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      var self = this;
      setTimeout(function () { self.applyGain(); }, ms + 40);
    },

    slam: function () {
      if (!this.built || !this.on) return;
      var c = this.ctx, now = c.currentTime;
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, now);
      o.frequency.exponentialRampToValueAtTime(24, now + 0.55);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(1.0, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      o.connect(g); g.connect(this.master);
      o.start(now); o.stop(now + 0.85);

      var n = c.createBufferSource();
      n.buffer = this.makeNoiseBuf(0.6, 'white');
      var f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900;
      var ng = c.createGain();
      ng.gain.setValueAtTime(0.7, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      n.connect(f); f.connect(ng); ng.connect(this.master);
      n.start(now); n.stop(now + 0.4);
    },

    crack: function () {
      if (!this.built || !this.on) return;
      var c = this.ctx, now = c.currentTime;
      var n = c.createBufferSource();
      n.buffer = this.makeNoiseBuf(0.25, 'white');
      var hp = c.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 1600;
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.55, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      n.connect(hp); hp.connect(g); g.connect(this.master);
      n.start(now); n.stop(now + 0.16);

      var o = c.createOscillator(), og = c.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(1900, now);
      o.frequency.exponentialRampToValueAtTime(420, now + 0.05);
      og.gain.setValueAtTime(0.0001, now);
      og.gain.exponentialRampToValueAtTime(0.12, now + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
      o.connect(og); og.connect(this.master);
      o.start(now); o.stop(now + 0.1);
    },

    shriek: function () {
      if (!this.built || !this.on) return;
      var c = this.ctx, now = c.currentTime;
      var out = c.createGain();
      out.gain.setValueAtTime(0.0001, now);
      out.gain.exponentialRampToValueAtTime(1.0, now + 0.012);
      out.gain.exponentialRampToValueAtTime(0.32, now + 0.35);
      out.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
      out.connect(this.master);

      // FM scream
      for (var i = 0; i < 2; i++) {
        var car = c.createOscillator();
        car.type = 'sawtooth';
        var base = i ? 690 : 655;
        car.frequency.setValueAtTime(base, now);
        car.frequency.exponentialRampToValueAtTime(base * 0.32, now + 0.85);

        var mod = c.createOscillator();
        mod.type = 'sine';
        mod.frequency.setValueAtTime(1180 + i * 90, now);
        mod.frequency.exponentialRampToValueAtTime(320, now + 0.8);
        var mg = c.createGain();
        mg.gain.setValueAtTime(900, now);
        mg.gain.exponentialRampToValueAtTime(60, now + 0.85);
        mod.connect(mg); mg.connect(car.frequency);
        mod.start(now); mod.stop(now + 0.9);

        var cg = c.createGain();
        cg.gain.value = i ? 0.4 : 0.6;
        car.connect(cg); cg.connect(out);
        car.start(now); car.stop(now + 1.0);
      }

      // noise rasp
      var n = c.createBufferSource();
      n.buffer = this.makeNoiseBuf(1.0, 'white');
      var bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.setValueAtTime(2400, now);
      bp.frequency.exponentialRampToValueAtTime(700, now + 0.7);
      bp.Q.value = 1.4;
      var ng = c.createGain();
      ng.gain.setValueAtTime(0.5, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      n.connect(bp); bp.connect(ng); ng.connect(out);
      n.start(now); n.stop(now + 0.95);
    },

    riser: function (sec) {
      if (!this.built || !this.on) return;
      var c = this.ctx, now = c.currentTime;
      var n = c.createBufferSource();
      n.buffer = this.makeNoiseBuf(sec + 0.2, 'white');
      var bp = c.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(180, now);
      bp.frequency.exponentialRampToValueAtTime(4200, now + sec);
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.32, now + sec * 0.96);
      g.gain.exponentialRampToValueAtTime(0.0001, now + sec + 0.12);
      n.connect(bp); bp.connect(g); g.connect(this.master);
      n.start(now); n.stop(now + sec + 0.2);
    },

    knock: function (pan) {
      if (!this.built || !this.on) return;
      var c = this.ctx, now = c.currentTime;
      var p = c.createStereoPanner ? c.createStereoPanner() : null;
      if (p) { p.pan.value = pan || 0; p.connect(this.master); }
      var dest = p || this.master;
      for (var i = 0; i < 2; i++) {
        var t0 = now + i * 0.19;
        var n = c.createBufferSource();
        n.buffer = this.makeNoiseBuf(0.2, 'white');
        var f = c.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 3;
        var g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
        n.connect(f); f.connect(g); g.connect(dest);
        n.start(t0); n.stop(t0 + 0.12);
      }
    },

    toggle: function () {
      if (!this.built) return this.init();
      this.on = !this.on;
      this.applyGain();
      el.sound.classList.toggle('on', this.on);
      el.sound.setAttribute('aria-pressed', this.on ? 'true' : 'false');
      el.soundLabel.textContent = this.on ? '声音 · 开' : '声音 · 关';
    }
  };

  /* =========================================================
     SCARE FX
     ========================================================= */

  var scareCv = el.scare;
  var scareCtx = scareCv ? scareCv.getContext('2d') : null;

  function sizeScare() {
    if (!scareCv) return;
    var w = Math.round(innerWidth * 0.5);
    var h = Math.round(innerHeight * 0.5);
    if (scareCv.width === w && scareCv.height === h) return;
    scareCv.width = w;
    scareCv.height = h;
    if (scareCv.style.opacity === '1') drawFace(1);
  }

  function drawFace(alpha) {
    if (!scareCtx) return;
    var x = scareCtx, w = scareCv.width, h = scareCv.height;

    if (!scareCv._tmp) scareCv._tmp = document.createElement('canvas');
    var t = scareCv._tmp;
    if (t.width !== w || t.height !== h) { t.width = w; t.height = h; }

    var tx = t.getContext('2d');
    tx.setTransform(1, 0, 0, 1, 0, 0);
    tx.fillStyle = '#000';
    tx.fillRect(0, 0, w, h);

    var R = h * 0.64;
    tx.save();
    tx.translate(w * 0.5, h * 0.5);
    tx.rotate(-0.12);

    // a face the camera couldn't expose properly
    var g = tx.createRadialGradient(-R * 0.28, -R * 0.4, R * 0.05, 0, 0, R * 1.15);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.34, '#d8cbb8');
    g.addColorStop(0.6, '#5f5548');
    g.addColorStop(0.82, '#161311');
    g.addColorStop(1, '#000');
    tx.fillStyle = g;
    tx.beginPath();
    tx.ellipse(0, 0, R * 0.74, R, 0, 0, Math.PI * 2);
    tx.fill();

    // hard shadow down one side
    var sh = tx.createLinearGradient(-R * 0.3, 0, R * 0.8, R * 0.3);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(0.5, 'rgba(0,0,0,.5)');
    sh.addColorStop(1, 'rgba(0,0,0,.95)');
    tx.fillStyle = sh;
    tx.beginPath();
    tx.ellipse(0, 0, R * 0.74, R, 0, 0, Math.PI * 2);
    tx.fill();

    // voids
    tx.fillStyle = '#000';
    tx.beginPath(); tx.ellipse(-R * 0.30, -R * 0.16, R * 0.25, R * 0.19, -0.1, 0, Math.PI * 2); tx.fill();
    tx.beginPath(); tx.ellipse(R * 0.32, -R * 0.2, R * 0.27, R * 0.16, 0.1, 0, Math.PI * 2); tx.fill();
    tx.beginPath(); tx.ellipse(R * 0.03, R * 0.44, R * 0.2, R * 0.3, 0.05, 0, Math.PI * 2); tx.fill();
    tx.restore();

    // one bad frame of a bad video
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.filter = 'blur(' + (h * 0.016).toFixed(1) + 'px) contrast(1.45) brightness(1.05)';
    x.globalAlpha = alpha == null ? 1 : alpha;
    x.drawImage(t, 0, 0, w, h, -w * 0.01, 0, w, h);
    x.filter = 'none';
    x.globalAlpha = 1;

    // smear
    x.globalAlpha = 0.4;
    x.drawImage(scareCv, 0, 0, w, h, -w * 0.022, 0, w, h);
    x.globalAlpha = 1;

    // grain
    if (!scareCv._pat) scareCv._pat = x.createPattern(NOISE, 'repeat');
    x.globalAlpha = 0.2;
    x.fillStyle = scareCv._pat;
    x.fillRect(0, 0, w, h);
    x.globalAlpha = 1;

    // crush the edges
    var vg = x.createRadialGradient(w * 0.5, h * 0.5, h * 0.14, w * 0.5, h * 0.5, h * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.68, 'rgba(0,0,0,.55)');
    vg.addColorStop(1, 'rgba(0,0,0,.99)');
    x.fillStyle = vg;
    x.fillRect(0, 0, w, h);

    scareCv.style.opacity = '1';
  }

  function hideFace() {
    if (scareCv) scareCv.style.opacity = '0';
  }

  function flash(ms, color) {
    if (!el.flash || REDUCED) return;
    el.flash.style.background = color || '#fff';
    el.flash.style.opacity = '1';
    setTimeout(function () { el.flash.style.opacity = '0'; }, ms || 60);
  }

  function shake() {
    if (REDUCED) return;
    el.body.classList.add('shake');
    setTimeout(function () { el.body.classList.remove('shake'); }, 220);
  }

  /* =========================================================
     MUTATIONS
     ========================================================= */

  var MUT = [
    /* ---- things you only notice on the way back up ---- */
    { sel: '#hero-sub', steps: [{ t: 1.0, html: '24 小时看着你的家。人形识别、红外夜视、两秒推送。<br>你睡着的时候，它在你旁边。' }] },
    { sel: '#hero-meta', steps: [{ t: 1.0, html: '已守护 <b>128,904</b> 个家庭 · 其中 <b>1</b> 个正在看你' }] },
    { sel: '#cf1', steps: [{ t: 1.0, html: '它从不误报。它只挑重要的看。' }] },
    { sel: '#cf2', steps: [{ t: 1.0, html: '它记得你长什么样。' }] },
    { sel: '#cf3', steps: [{ t: 1.0, html: '尤其是呼吸。' }] },
    { sel: '#cf4', steps: [{ t: 1.0, html: '试试说「有人吗」。' }] },

    /* ---- the live camera ---- */
    { sel: '#feed-lede', steps: [
      { t: 0.45, html: '我们把这台机器装在一个普通家庭里。现在是凌晨三点十二分。你不在家。' },
      { t: 0.86, html: '我们把这台机器装在一个普通家庭里。现在是凌晨三点十二分。你在家。' }
    ] },
    { sel: '#feed-note', steps: [{ t: 0.82, html: '画面里没有人。' }] },

    /* ---- the second camera ---- */
    { sel: '#again-cam', steps: [{ t: 0.5, html: 'CAM 02 · 你的走廊' }] },

    /* ---- testimonials ---- */
    { sel: '#q1', steps: [
      { t: 1.0, html: '“装完第二周就派上用场了。凌晨有人在我家门口转了三圈，手机直接响了。”' },
      { t: 1.0, html: '“装完第二周就派上用场了。我打开画面，走廊里没有人。”' }
    ] },
    { sel: '#q2', steps: [{ t: 1.0, html: '“我在公司也能看见孩子在客厅写作业。”<i>现在她知道了。</i>' }] },
    { sel: '#q3', steps: [{ t: 1.0, html: '“用了两年，没出过一次问题。”<i>（采访到此中断。）</i>' }] },
    { sel: '#pr3', steps: [{ t: 1.0, html: '<span>36 氪</span>守夜在做的，是监视。' }] },

    /* ---- privacy ---- */
    { sel: '#priv-h2', steps: [{ t: 0.5, html: '我们一直在看。' }] },
    { sel: '#tick-3', steps: [
      { t: 0.45, html: '7 天后自动删除' },
      { t: 0.75, html: '<s>7 天后自动删除</s><em>7 天后，我们不再删除。</em>' }
    ] },
    { sel: '#priv-fine', steps: [{ t: 0.8, html: '你的生活，我们都在看。' }] },

    /* ---- pricing ---- */
    { sel: '#plan-3-desc', steps: [{ t: 0.7, html: '我们已经评估过了。' }] },
    { sel: '#plan-3-cta', steps: [{ t: 0.9, html: '等我们联系你' }] },

    /* ---- faq ---- */
    { sel: '#fa1', steps: [{ t: 0.6, html: '本地 256G，加密。也存一份在我们这里。' }] },
    { sel: '#fa2', steps: [{ t: 0.7, html: '不会。只有我们。' }] },
    { sel: '#fa3', steps: [{ t: 0.8, html: '能。它不需要网。' }] },
    { sel: '#fa4', steps: [{ t: 0.9, html: '你试试。' }] },

    /* ---- the end of the site ---- */
    { sel: '#cta-lede', steps: [{ t: 0.5, html: '不用预约。我们已经到了。' }] },
    { sel: '#cta-fine', steps: [{ t: 0.8, html: '我们不会打扰你。我们只是看着。' }] },
    { sel: '#foot-rights', steps: [{ t: 0.6, html: '保留所有画面' }] },
    { sel: '#foot-rec', steps: [{ t: 0.7, html: '正在录制' }] }
  ].map(function (m) { m.node = $(m.sel); m.i = 0; return m; });

  function elProgress(node) {
    if (!node || !node.offsetParent) return 0;
    var r = node.getBoundingClientRect();
    return clamp((S.vh - r.top) / (S.vh + r.height), 0, 1);
  }

  function runMutations() {
    for (var k = 0; k < MUT.length; k++) {
      var m = MUT[k];
      if (!m.node || m.i >= m.steps.length) continue;
      if (elProgress(m.node) >= m.steps[m.i].t) {
        m.node.innerHTML = m.steps[m.i].html;
        m.i++;
        while (m.i < m.steps.length && elProgress(m.node) >= m.steps[m.i].t) {
          m.node.innerHTML = m.steps[m.i].html;
          m.i++;
        }
      }
    }
  }

  /* =========================================================
     SCARES
     ========================================================= */

  function armed() { return S.armed; }

  function once(key) {
    if (!S.armed || S.fired[key]) return false;
    S.fired[key] = true;
    return true;
  }

  // S1 — something in the corner of the eye
  function scareEarly() {
    if (!once('s1')) return;
    A.crack();
    if (!REDUCED) {
      drawFace(0.35);
      el.scare.style.transition = 'none';
      el.scare.style.opacity = '0.4';
      setTimeout(function () { hideFace(); }, 60);
    }
  }

  // S2 — the figure is closer than it was
  function scareFeed() {
    if (!once('s2')) return;
    if (feedA) { feedA.z = 0.8; feedA.fig = 1; feedA.glitch = 0.8; }
    A.slam();
    A.crack();
    shake();
    flash(50, '#fff');
    setTimeout(function () {
      if (feedA) { feedA.z = 0.04; feedA.fig = 0.9; feedA.glitch = 0; }
    }, 260);
  }

  // S3 — the lights go out for a moment
  function scareDark() {
    if (!once('s3')) return;
    A.duck(700);
    A.knock(-0.85);
    if (!REDUCED) {
      el.site.style.transition = 'filter .08s linear, opacity .08s linear';
      el.site.style.filter = 'brightness(.06)';
      setTimeout(function () {
        el.site.style.filter = 'none';
        setTimeout(function () { el.site.style.transition = ''; }, 300);
      }, 260);
    }
  }

  // S4 — it was never behind you
  function bigScare() {
    if (!once('s4')) return;
    A.punch();                // the room comes back at full power, then screams
    A.shriek();
    A.slam();
    shake();
    if (feedB) { feedB.z = 0.95; feedB.fig = 1; feedB.glitch = 0.9; }

    if (!REDUCED) {
      el.scare.style.transition = 'none';
      drawFace(1);
      flash(45, '#fff');
      setTimeout(function () { flash(60, '#fff'); }, 130);
      setTimeout(hideFace, 300);
    }

    setTimeout(function () {
      el.blackout.style.transition = 'opacity .08s linear';
      el.blackout.style.opacity = '1';
    }, 240);

    // after the shock: silence, then the room comes back as nothing
    setTimeout(function () { if (A.built) A.duck(60000); }, 1400);
  }

  /* =========================================================
     FRAME
     ========================================================= */

  var beats = $$('.beat[data-b]').map(function (n) {
    var a = n.getAttribute('data-b').split(' ');
    return { node: n, a: parseFloat(a[0]), b: parseFloat(a[1]) };
  });
  beats.forEach(function (bt, i) {
    if (i < beats.length - 1) bt.b = Math.max(bt.b, beats[i + 1].a + 0.006);
  });

  var beatEnd = $('.beat-end');
  var TITLES = { 1: '守夜 NIGHTWATCH — 我们不睡', 2: '守夜 — 实拍', 3: '守夜 — 它在看', 4: '守夜 — 别回头', 5: '守夜 — 晚安' };

  var SECTIONS = [
    ['#top', 1], ['#specs', 1], ['#why', 1], ['#features', 1], ['#how', 1], ['#proof', 1], ['#press', 1],
    ['#feed', 2], ['#again', 3], ['#privacy', 4], ['#pricing', 4], ['#faq', 4],
    ['#cta', 5], ['#footer', 5], ['#finale', 5]
  ]
    .map(function (s) { return { node: $(s[0]), act: s[1] }; })
    .filter(function (s) { return s.node; });

  function measure() {
    S.vh = innerHeight;
    S.vw = innerWidth;
    var docH = document.documentElement.scrollHeight;
    S.maxY = Math.max(1, docH - S.vh);
    var r = el.finale.getBoundingClientRect();
    S.finaleTop = r.top + scrollY;
    S.finaleH = el.finale.offsetHeight;
    if (feedA) feedA.resize();
    if (feedC) feedC.resize();
    if (feedB) feedB.resize();
  }

  function updateAct() {
    var mid = S.y + S.vh * 0.45, act = 1;
    for (var i = 0; i < SECTIONS.length; i++) {
      var top = SECTIONS[i].node.getBoundingClientRect().top + S.y;
      if (top <= mid) act = SECTIONS[i].act;
    }
    if (act !== S.act) { S.act = act; el.body.setAttribute('data-act', String(act)); }
    if (act > S.maxAct) { S.maxAct = act; document.title = TITLES[act] || TITLES[5]; }
  }

  var lastT = 0;

  function frame(now) {
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;

    var y = (STATIC && FORCE_Y !== null) ? FORCE_Y : scrollY;
    S.y = y;
    S.p = clamp(y / S.maxY, 0, 1);
    S.maxP = Math.max(S.maxP, S.p);

    if (S.p < 0.05) S.armed = true;

    updateAct();
    runMutations();

    // ---- feed section
    var fs = el.feedSec;
    if (fs && feedA) {
      var fr = fs.getBoundingClientRect();
      var travel = fs.offsetHeight - S.vh;
      S.feedT = clamp(-fr.top / Math.max(1, travel), 0, 1);
      var t = S.feedT;
      var visible = fr.top < S.vh && fr.bottom > 0;
      if (visible) {
        // the figure: appears far away, waits, then is suddenly close
        if (t < 0.22) { feedA.fig = 0; feedA.z = 0.02; }
        else if (t < 0.55) { feedA.fig = clamp((t - 0.22) / 0.12, 0, 1); feedA.z = 0.03; }
        else if (t < 0.62) { feedA.fig = 1; }
        else if (t < 0.72) { feedA.fig = 0.9; feedA.z = 0.05; }
        else { feedA.fig = 0; }
        feedA.draw(dt);
      }
      if (t > 0.5 && S.act >= 2) scareFeed();
    }

    // ---- the other camera
    var ag = $('#again');
    if (ag && feedC) {
      var ar = ag.getBoundingClientRect();
      S.againT = clamp((S.vh * 0.75 - ar.top) / Math.max(1, ar.height), 0, 1);
      if (ar.top < S.vh && ar.bottom > 0) {
        feedC.dim = 0.06 + clamp((S.vh - ar.top) / S.vh, 0, 1) * 0.3;
        feedC.draw(dt);
      }
    }

    // ---- the first crack: the moment "实拍" comes into view
    if (fs) {
      var fr2 = fs.getBoundingClientRect();
      if (fr2.top < S.vh * 0.9) scareEarly();
    }
    // ---- lights out, when the privacy page settles
    var pvsec = $('#privacy');
    if (pvsec) {
      var pr2 = pvsec.getBoundingClientRect();
      if (pr2.top < S.vh * 0.55) scareDark();
    }
    // ---- something knocks while you are reading the questions
    var fq = $('#faq');
    if (fq) {
      var fqr = fq.getBoundingClientRect();
      if (fqr.top < S.vh * 0.3 && once('s25')) { A.knock(0.9); A.crack(); }
    }

    // ---- the room closes in
    var grim = clamp((S.p - 0.1) / 0.5, 0, 1);
    if (Math.abs(grim - (S.grim || 0)) > 0.004) {
      S.grim = grim;
      el.oppress.style.opacity = (grim * 0.66).toFixed(3);
    }

    // ---- finale
    var fp = clamp((y - S.finaleTop) / Math.max(1, S.finaleH - S.vh), 0, 1);
    S.fp = fp;

    if (feedB) {
      if (fp > 0) {
        // it creeps closer while you read — slowly, then all at once
        var z = 0.02 + 0.5 * Math.pow(clamp(fp / 0.55, 0, 1), 2.2);
        if (feedB.z < 1) { feedB.z = z; feedB.fig = clamp(fp * 12, 0, 0.92); }
        feedB.dim = clamp(0.12 + fp * 0.34, 0, 0.55);
        if (!S.fired.s4) feedB.draw(dt);
      } else {
        feedB.fig = 0;
      }
    }

    var inFin = fp > 0.002;
    if (inFin !== S.inFin) { S.inFin = inFin; el.body.classList.toggle('in-fin', inFin); }

    renderBeats(fp);

    S.tick = (S.tick || 0) + 1;
    if (S.tick % 10 === 1) renderHud();

    // silence at the top of the page; the drone fades in as the site gets wrong
    var tension = clamp((S.p - 0.17) / 0.52, 0, 1);
    tension = Math.min(1, tension + fp * 0.5);
    if (Math.abs(tension - (S.lastTension || 0)) > 0.006) {
      S.lastTension = tension;
      A.setTension(tension);
    }

    if (!STATIC) requestAnimationFrame(frame);
  }

  function renderBeats(fp) {
    if (fp <= 0) {
      beats.forEach(function (b) { b.node.style.opacity = '0'; b.node.style.visibility = 'hidden'; });
      return;
    }
    for (var i = 0; i < beats.length; i++) {
      var bt = beats[i], o = 0, dy = 0;
      if (fp >= bt.a && fp <= bt.b) {
        var inn = map(fp, bt.a, bt.a + 0.012);
        var out = 1 - map(fp, bt.b - 0.012, bt.b);
        o = Math.min(inn, out);
        dy = (1 - inn) * 18 - (1 - out) * 12;
      }
      bt.node.style.visibility = o > 0.002 ? 'visible' : 'hidden';
      bt.node.style.opacity = o.toFixed(3);
      if (!REDUCED) bt.node.style.transform = 'translate3d(0,' + dy.toFixed(1) + 'px,0)';
    }

    // "现在，回头。" — then it comes, on its own clock
    if (fp > 0.44 && once('turn')) {
      A.duck(1500);
      A.riser(1.2);
      setTimeout(bigScare, 1500);
    }

    if (!S.endDone && fp > 0.995) {
      S.endDone = true;
      var lines = $$('.beat-end .end-line');
      var delays = [200, 2600, 5400, 8200];
      lines.forEach(function (l, k) {
        setTimeout(function () { l.style.opacity = '1'; }, delays[k]);
      });
      setTimeout(function () { document.title = '守夜 — 还在'; }, 8200);
      setTimeout(raiseGate, 16000);
    }
  }

  function raiseGate() {
    if (S.gateBack || !el.gate) return;
    S.gateBack = true;
    var b = $('#enter');
    if (b) b.innerHTML = '<span class="rec-dot"></span>再进去一次';
    el.gate.classList.remove('gone');
    document.body.classList.add('locked');
    if (A.built && A.on) { A.duck(4000); }
  }

  var base = Date.now();
  var CAM_BASE = new Date();
  CAM_BASE.setHours(3, 12, 44, 0);

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function hhmmss(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }

  function renderHud() {
    var t = Math.floor((Date.now() - S.started) / 1000);
    var now = new Date();

    if (el.camTs) {
      // the camera's clock drifts back thirty-one minutes when the figure appears
      var shift = S.feedT > 0.45 ? -(31 * 60 + 32) : 0;
      el.camTs.textContent = hhmmss(new Date(CAM_BASE.getTime() + (t + shift) * 1000));
    }
    if (el.finTs) el.finTs.textContent = hhmmss(now);
    if (el.againTs) {
      // the second camera is not on the same clock as the first one
      el.againTs.textContent = S.againT > 0.45
        ? hhmmss(now)
        : hhmmss(new Date(CAM_BASE.getTime() + (t + 4) * 1000));
    }
    if (el.heroTs) {
      el.heroTs.textContent = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) + ' ' + hhmmss(now);
    }
    var gc = $('#gate-clock');
    if (gc) gc.textContent = hhmmss(now);
  }

  /* =========================================================
     WIRING
     ========================================================= */

  function unlock() {
    document.body.classList.remove('locked');
    el.gate.classList.add('gone');
    if (!A.built) {
      A.init();
      A.on = true;
      el.sound.classList.add('show', 'on');
      el.sound.setAttribute('aria-pressed', 'true');
      el.soundLabel.textContent = '声音 · 开';
    }
    if (scrollY > 4) scrollTo(0, 0);
    if (A.built) { A.duckUntil = 0; A.punchUntil = 0; }
    A.setTension(0);           // silence. the room fills in later, as you scroll
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  }

  $('#enter').addEventListener('click', function () {
    if (S.gateBack) { scrollTo({ top: 0, behavior: 'auto' }); }
    unlock();
  });
  el.gate.addEventListener('click', function (e) { if (e.target === el.gate) unlock(); });

  el.sound.addEventListener('click', function () { A.toggle(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'm' || e.key === 'M') A.toggle();
  });

  addEventListener('scroll', function () {
    S.idle = 0;
    if (scrollY > 8) el.nav.classList.add('scrolled');
    else el.nav.classList.remove('scrolled');
  }, { passive: true });

  addEventListener('resize', function () {
    measure();
    sizeScare();
    if (feedA) feedA.draw(0);
    if (feedB) feedB.draw(0);
    if (feedC) feedC.draw(0);
  });

  // it waits for you to stop
  setInterval(function () {
    S.idle += 1;
    if (S.idle === 26 && S.p > 0.3 && !STATIC) {
      A.knock(rand(-0.9, 0.9));
      A.crack();
    }
  }, 1000);

  // visit counter
  setTimeout(function () {
    var v = $('#visitors');
    if (v && S.maxP > 0.3) v.innerHTML = '本页当前观看人数 <b>2</b>';
  }, 20000);

  /* -------------------------------------------------------
     boot
     ------------------------------------------------------- */
  function boot() {
    scrollTo(0, 0);
    measure();
    sizeScare();

    if (STATIC) {
      el.gate.style.display = 'none';
      document.body.classList.remove('locked');
      if (QS.has('fy')) {
        FORCE_Y = parseInt(QS.get('fy'), 10) || 0;
        var ft = el.finale.getBoundingClientRect().top + scrollY;
        el.finaleTop = ft;
        S.finaleTop = ft;
        S.finaleH = el.finale.offsetHeight;
        el.site.style.marginTop = (-FORCE_Y) + 'px';
      }
      for (var i = 0; i < 8; i++) frame(i * 16);
      if (QS.has('scare')) { drawFace(1); el.scare.style.opacity = '1'; }
      // headless capture can resize after the loop stops — repaint a few times
      [150, 600, 1400].forEach(function (ms) {
        setTimeout(function () {
          frame(performance.now());
          if (QS.has('scare')) { drawFace(1); el.scare.style.opacity = '1'; }
        }, ms);
      });
      return;
    }

    frame(performance.now());   // paint once immediately, even before rAF ticks
    requestAnimationFrame(function (t) { lastT = t; requestAnimationFrame(frame); });
  }

  addEventListener('load', function () { if (!STATIC) scrollTo(0, 0); });
  // debug handle (used by the offline audio checks)
  window.__NW = { A: A, S: S };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
