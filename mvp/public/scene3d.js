// ============================================================
// Doppelgänger — 3D-Hintergrund (Startbildschirm + Lobby)
// Dekorativ und non-blocking: schlägt die Initialisierung fehl,
// läuft das Spiel unverändert weiter (Canvas bleibt versteckt).
// API: window.DG3D.init(canvas) | setMode('start'|'room'|'hidden') | setPlayers(list)
// ============================================================
window.DG3D = (function () {
  var T, renderer, scene, camera, canvas, inited = false;
  var cubeGroup, room, backdrop;
  var players = {};     // id -> { g }
  var order = [];       // Sitz-Reihenfolge (Spieler-IDs)
  var seats = 8, RADIUS = 4.0, R = 3.0;
  var palette = [0x14140f, 0x00c2a8, 0xd85a30, 0x378add, 0x639922, 0xd4537e, 0xba7517, 0x534ab7];
  var mode = 'start', trans = 0, orbit = 0, clock = 0, running = false, firstFrame = false;
  var startCam;

  function rrect(x, a, b, w, h, r) {
    x.beginPath(); x.moveTo(a + r, b);
    x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
    x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
  }

  // ---------- Texturen ----------
  function qTex() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d');
    x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, 256, 256);
    x.font = 'bold 175px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#14140f'; x.fillText('?', 128, 128);
    return new T.CanvasTexture(c);
  }
  function splitTex() {
    var c = document.createElement('canvas'); c.width = c.height = 512; var x = c.getContext('2d');
    x.fillStyle = '#f4f3ee'; x.fillRect(0, 0, 512, 512); x.lineJoin = 'round'; x.lineCap = 'round';
    function headPath() {
      x.beginPath(); x.moveTo(256, 96);
      x.bezierCurveTo(358, 96, 397, 198, 381, 294);
      x.bezierCurveTo(365, 371, 314, 422, 256, 426);
      x.bezierCurveTo(198, 422, 147, 371, 131, 294);
      x.bezierCurveTo(115, 198, 154, 96, 256, 96);
    }
    headPath(); x.fillStyle = '#eceae3'; x.fill();
    x.save(); headPath(); x.clip();
    // Maschinen-Hälfte (rechts)
    x.save(); x.beginPath(); x.rect(256, 0, 256, 512); x.clip();
    x.fillStyle = '#dfe6e6'; x.fillRect(256, 80, 210, 360);
    x.strokeStyle = 'rgba(20,20,15,0.32)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(300, 150); x.bezierCurveTo(332, 210, 326, 300, 312, 362); x.stroke();
    x.shadowColor = '#00e0c4'; x.shadowBlur = 14; x.strokeStyle = '#16e0c4'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(282, 166); x.lineTo(333, 166); x.lineTo(362, 211); x.stroke();
    x.beginPath(); x.moveTo(301, 322); x.lineTo(372, 322); x.stroke(); x.shadowBlur = 0;
    x.fillStyle = '#15171b'; x.beginPath(); x.arc(312, 256, 30, 0, 7); x.fill();
    x.shadowColor = '#00e0c4'; x.shadowBlur = 16; x.fillStyle = '#16e0c4'; x.beginPath(); x.arc(312, 256, 19, 0, 7); x.fill(); x.shadowBlur = 0;
    x.fillStyle = '#e9fffb'; x.beginPath(); x.arc(312, 256, 8, 0, 7); x.fill();
    x.shadowColor = '#00e0c4'; x.shadowBlur = 12; x.strokeStyle = '#16e0c4'; x.lineWidth = 5; x.beginPath(); x.arc(374, 272, 27, 0, 7); x.stroke(); x.shadowBlur = 0;
    x.restore();
    // Menschen-Hälfte (links)
    x.save(); x.beginPath(); x.rect(0, 0, 256, 512); x.clip();
    x.strokeStyle = '#14140f'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(166, 220); x.quadraticCurveTo(202, 206, 238, 220); x.stroke();
    x.beginPath(); x.moveTo(166, 256); x.quadraticCurveTo(202, 230, 238, 256); x.quadraticCurveTo(202, 280, 166, 256); x.closePath(); x.stroke();
    x.fillStyle = '#14140f'; x.beginPath(); x.arc(202, 256, 9, 0, 7); x.fill();
    x.restore();
    x.restore();
    // Mittelnaht
    x.setLineDash([7, 9]); x.strokeStyle = '#14140f'; x.lineWidth = 3; x.beginPath(); x.moveTo(256, 102); x.lineTo(256, 420); x.stroke(); x.setLineDash([]);
    // Nase + Mund
    x.strokeStyle = '#14140f'; x.lineWidth = 3; x.beginPath(); x.moveTo(256, 266); x.lineTo(248, 334); x.quadraticCurveTo(256, 344, 267, 337); x.stroke();
    x.lineWidth = 4; x.beginPath(); x.moveTo(214, 362); x.quadraticCurveTo(236, 370, 256, 363); x.stroke();
    x.lineWidth = 3; x.beginPath(); x.moveTo(268, 357); x.lineTo(268, 373); x.moveTo(281, 357); x.lineTo(281, 373); x.moveTo(294, 357); x.lineTo(294, 373); x.stroke();
    headPath(); x.strokeStyle = '#14140f'; x.lineWidth = 5; x.stroke();
    return new T.CanvasTexture(c);
  }
  function plankTex() {
    var c = document.createElement('canvas'); c.width = c.height = 256; var x = c.getContext('2d');
    x.fillStyle = '#8a5a36'; x.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 55; i++) {
      var xx = Math.random() * 256; x.beginPath(); x.moveTo(xx, 0);
      x.bezierCurveTo(xx + (Math.random() * 8 - 4), 85, xx + (Math.random() * 8 - 4), 170, xx + (Math.random() * 6 - 3), 256);
      x.lineWidth = 0.6 + Math.random() * 2; var d = Math.random();
      x.strokeStyle = 'rgba(' + (90 + d * 40 | 0) + ',' + (58 + d * 24 | 0) + ',' + (34 + d * 16 | 0) + ',0.5)'; x.stroke();
    }
    var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  }
  function cardTex() {
    var c = document.createElement('canvas'); c.width = 200; c.height = 280; var x = c.getContext('2d');
    x.fillStyle = '#f7f6f1'; rrect(x, 6, 6, 188, 268, 16); x.fill(); x.lineWidth = 6; x.strokeStyle = '#14140f'; x.stroke();
    x.fillStyle = '#00c2a8'; rrect(x, 18, 18, 46, 46, 10); x.fill();
    x.fillStyle = '#14140f'; x.font = 'bold 150px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 100, 150);
    x.fillStyle = 'rgba(20,20,15,0.55)'; x.fillRect(40, 222, 120, 9); x.fillRect(40, 242, 80, 9);
    return new T.CanvasTexture(c);
  }
  function labelSprite(txt) {
    var c = document.createElement('canvas'); c.width = 256; c.height = 64; var x = c.getContext('2d');
    x.fillStyle = 'rgba(20,20,15,0.86)'; rrect(x, 0, 0, 256, 64, 14); x.fill();
    x.font = 'bold 30px sans-serif'; x.fillStyle = '#f4f3ee'; x.textAlign = 'center'; x.textBaseline = 'middle';
    var t = String(txt || ''); if (t.length > 12) t = t.slice(0, 11) + '…';
    x.fillText(t, 128, 34);
    var s = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(c), transparent: true }));
    s.scale.set(1.25, 0.31, 1); return s;
  }

  // ---------- Aufbau ----------
  function build() {
    scene = new T.Scene(); scene.background = new T.Color('#1a1a17');
    camera = new T.PerspectiveCamera(45, 1, 0.1, 100);
    startCam = new T.Vector3(0, 0.1, 7);

    scene.add(new T.AmbientLight(0xffffff, 0.5));
    var keyL = new T.DirectionalLight(0xfff1dd, 1.0); keyL.position.set(5, 9, 5); keyL.castShadow = true;
    keyL.shadow.mapSize.width = 1024; keyL.shadow.mapSize.height = 1024;
    var s = keyL.shadow.camera; s.left = -9; s.right = 9; s.top = 9; s.bottom = -9; s.near = 0.5; s.far = 30; scene.add(keyL);
    var warm = new T.PointLight(0xffd9a0, 0.7, 40); warm.position.set(0, 6, 0); scene.add(warm);

    // Hintergrund-Plane (dunkel + Teal-Schimmer)
    var bc = document.createElement('canvas'); bc.width = bc.height = 512; var bx = bc.getContext('2d');
    var g = bx.createRadialGradient(256, 210, 30, 256, 260, 380);
    g.addColorStop(0, '#2c2820'); g.addColorStop(0.55, '#1e1b15'); g.addColorStop(1, '#121009');
    bx.fillStyle = g; bx.fillRect(0, 0, 512, 512);
    bx.strokeStyle = 'rgba(0,194,168,0.16)'; bx.lineWidth = 10; bx.beginPath(); bx.arc(256, 225, 150, 0, Math.PI * 2); bx.stroke();
    backdrop = new T.Mesh(new T.PlaneGeometry(40, 24), new T.MeshBasicMaterial({ map: new T.CanvasTexture(bc) }));
    backdrop.position.set(0, 0.4, -7); scene.add(backdrop);

    // Würfel
    cubeGroup = new T.Group(); scene.add(cubeGroup);
    var q = qTex();
    function ms(t) { return new T.MeshStandardMaterial({ map: t, roughness: 0.5 }); }
    var cube = new T.Mesh(new T.BoxGeometry(2, 2, 2), [ms(q), ms(q), ms(q), ms(q), ms(splitTex()), ms(q)]);
    cube.castShadow = true; cubeGroup.add(cube);
    cube.add(new T.LineSegments(new T.EdgesGeometry(cube.geometry), new T.LineBasicMaterial({ color: 0x14140f })));

    // Raum mit rundem Holztisch
    room = new T.Group(); room.visible = false; scene.add(room);
    var floor = new T.Mesh(new T.CircleGeometry(16, 48), new T.MeshStandardMaterial({ color: 0x211d18, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.2; floor.receiveShadow = true; room.add(floor);
    var seam = new T.Mesh(new T.CylinderGeometry(R - 0.02, R - 0.02, 0.22, 64), new T.MeshStandardMaterial({ color: 0x2c1c10, roughness: 0.9 }));
    seam.position.y = 0.01; room.add(seam);
    var pTex = plankTex(); var pw = 0.34, gap = 0.03;
    for (var px = -R + 0.02; px < R; px += pw) {
      var x1 = px - (pw - gap) / 2, x2 = px + (pw - gap) / 2; x1 = Math.max(-R, x1); x2 = Math.min(R, x2);
      if (x2 - x1 < 0.04) continue;
      var pts = [], steps = 10, k, xc, yy;
      for (k = 0; k <= steps; k++) { xc = x1 + (x2 - x1) * k / steps; yy = Math.sqrt(Math.max(0, R * R - xc * xc)); pts.push(new T.Vector2(xc, -yy)); }
      for (k = 0; k <= steps; k++) { xc = x2 + (x1 - x2) * k / steps; yy = Math.sqrt(Math.max(0, R * R - xc * xc)); pts.push(new T.Vector2(xc, yy)); }
      var geo = new T.ExtrudeGeometry(new T.Shape(pts), { depth: 0.27, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
      var mat = new T.MeshStandardMaterial({ map: pTex, roughness: 0.55 });
      mat.color = new T.Color().setHSL(0.075, 0.42, 0.30 + Math.random() * 0.07);
      var plank = new T.Mesh(geo, mat); plank.position.y = -0.105; plank.castShadow = true; plank.receiveShadow = true; room.add(plank);
    }
    var ped = new T.Mesh(new T.CylinderGeometry(0.42, 0.62, 1.0, 24), new T.MeshStandardMaterial({ color: 0x5e3c22, roughness: 0.7 })); ped.position.y = -0.7; room.add(ped);
    var base = new T.Mesh(new T.CylinderGeometry(1.25, 1.25, 0.16, 24), new T.MeshStandardMaterial({ color: 0x5e3c22, roughness: 0.7 })); base.position.y = -1.12; base.receiveShadow = true; room.add(base);

    // Frage-Karten
    var white = new T.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.85 });
    var teal = new T.MeshStandardMaterial({ color: 0x00c2a8, roughness: 0.7 });
    var face = new T.MeshStandardMaterial({ map: cardTex(), roughness: 0.6 });
    var cardMats = [white, white, face, teal, white, white];
    for (var ci = 0; ci < 7; ci++) {
      var a = Math.random() * 6.283, r2 = 0.45 + Math.random() * 1.7;
      var card = new T.Mesh(new T.BoxGeometry(0.6, 0.02, 0.84), cardMats);
      card.position.set(Math.cos(a) * r2, 0.185, Math.sin(a) * r2); card.rotation.y = Math.random() * 6.283;
      card.castShadow = true; room.add(card);
    }
  }

  // ---------- Avatare ----------
  function seatAt(g, idx) {
    var ang = -Math.PI / 2 + (idx % seats) * (Math.PI * 2 / seats);
    var px = Math.cos(ang) * RADIUS, pz = Math.sin(ang) * RADIUS;
    g.position.set(px, -0.25, pz); g.rotation.y = Math.atan2(-px, -pz);
  }
  function addAvatar(id, name, idx) {
    var g = new T.Group();
    var col = palette[idx % palette.length];
    var body = new T.Mesh(new T.CylinderGeometry(0.3, 0.42, 0.95, 18), new T.MeshStandardMaterial({ color: col, roughness: 0.65 }));
    body.position.y = 0.1; body.castShadow = true; g.add(body);
    var head = new T.Mesh(new T.SphereGeometry(0.27, 22, 18), new T.MeshStandardMaterial({ color: 0xf0d6b0, roughness: 0.85 }));
    head.position.y = 0.78; head.castShadow = true; g.add(head);
    var lbl = labelSprite(name); lbl.position.set(0, 1.45, 0); g.add(lbl);
    seatAt(g, idx); g.scale.setScalar(0.01); g.userData.t = 0;
    room.add(g); players[id] = { g: g };
  }
  function clearPlayers() {
    for (var id in players) { if (players[id]) room.remove(players[id].g); }
    players = {}; order = [];
  }

  // ---------- Schleife ----------
  function resize() {
    if (!inited) return;
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function loop() {
    if (!running) return;
    requestAnimationFrame(loop); clock += 0.016;
    var target = mode === 'room' ? 1 : 0; trans += (target - trans) * 0.06;
    room.visible = (mode === 'room') || trans > 0.02;
    cubeGroup.visible = trans < 0.985; backdrop.visible = trans < 0.985;
    cubeGroup.rotation.y += 0.012; cubeGroup.rotation.x += 0.005;
    cubeGroup.position.y = Math.sin(clock * 1.2) * 0.12;
    cubeGroup.scale.setScalar(Math.max(0.001, 1 - trans));
    if (mode === 'room') orbit += 0.0028;
    var rc = new T.Vector3(Math.sin(orbit) * 8.5, 5.2, Math.cos(orbit) * 8.5);
    camera.position.copy(startCam.clone().lerp(rc, trans));
    camera.lookAt(0, -1.6 + trans * 1.8, 0);
    for (var id in players) {
      var p = players[id]; if (!p) continue;
      if (p.g.userData.t < 1) { p.g.userData.t = Math.min(1, p.g.userData.t + 0.07); var e = 1 - Math.pow(1 - p.g.userData.t, 3); p.g.scale.setScalar(e); }
    }
    renderer.render(scene, camera);
    if (!firstFrame) {
      firstFrame = true;
      var ph = document.getElementById('bg3d-ph');
      if (ph) { ph.style.opacity = '0'; setTimeout(function () { ph.style.display = 'none'; }, 600); }
    }
  }

  // ---------- API ----------
  function init(cnv) {
    if (inited) return;
    try {
      if (!window.THREE) return;
      T = window.THREE; canvas = cnv;
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      build(); resize();
      window.addEventListener('resize', resize);
      inited = true;
    } catch (e) { try { console.warn('DG3D init failed', e); } catch (_) {} inited = false; }
  }
  function setMode(m) {
    if (!inited) return;
    if (m === 'hidden') { running = false; canvas.style.display = 'none'; return; }
    canvas.style.display = 'block';
    if (m === 'start') clearPlayers();
    mode = m;
    if (!running) { running = true; resize(); loop(); }
  }
  function setPlayers(list) {
    if (!inited || !Array.isArray(list)) return;
    var ids = list.map(function (p) { return p.id; });
    // Entfernte raus
    Object.keys(players).forEach(function (id) {
      if (ids.indexOf(id) < 0) { room.remove(players[id].g); delete players[id]; }
    });
    order = order.filter(function (id) { return ids.indexOf(id) >= 0; });
    // Neue rein / Plätze aktualisieren
    list.forEach(function (p, idx) {
      if (players[p.id]) { seatAt(players[p.id].g, idx); }
      else { addAvatar(p.id, p.name, idx); order.push(p.id); }
    });
  }

  return { init: init, setMode: setMode, setPlayers: setPlayers };
})();
