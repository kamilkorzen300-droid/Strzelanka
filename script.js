
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const $ = id => document.getElementById(id);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x84949a);
scene.fog = new THREE.Fog(0x84949a, 85, 245);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 450);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

$('game').appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe7f5ff, 0x444039, 2));

const sun = new THREE.DirectionalLight(0xffe3bd, 2.1);
sun.position.set(-45, 95, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -145;
sun.shadow.camera.right = 145;
sun.shadow.camera.top = 145;
sun.shadow.camera.bottom = -145;
scene.add(sun);

const mats = {
  floor: new THREE.MeshStandardMaterial({ color: 0x59645e, roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x48535a, roughness: .9 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x27333b, roughness: .8 }),
  crate: new THREE.MeshStandardMaterial({ color: 0x98683d, roughness: .95 }),
  stripe: new THREE.MeshStandardMaterial({ color: 0xe49a39 }),
  bot: new THREE.MeshStandardMaterial({ color: 0x16a5b7 }),
  botDark: new THREE.MeshStandardMaterial({ color: 0x173b48 }),
  botEye: new THREE.MeshStandardMaterial({
    color: 0xffa53c,
    emissive: 0xff5a00,
    emissiveIntensity: 1.4
  })
};

const obstacles = [];

function box(x, y, z, w, h, d, mat, collide = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);

  if (collide) {
    obstacles.push({ x, z, hw: w / 2, hd: d / 2 });
  }

  return m;
}

// MAPA
box(0, -.5, 0, 250, 1, 250, mats.floor, false);

box(0, 5, -125, 250, 10, 2, mats.wall);
box(0, 5, 125, 250, 10, 2, mats.wall);
box(-125, 5, 0, 2, 10, 250, mats.wall);
box(125, 5, 0, 2, 10, 250, mats.wall);

box(-48, 7, -47, 42, 14, 34, mats.wall);
box(-48, 14.2, -47, 43, 1, 35, mats.roof, false);

box(48, 7, 34, 44, 14, 38, mats.wall);
box(48, 14.2, 34, 45, 1, 39, mats.roof, false);

box(0, 5, 83, 32, 10, 18, mats.wall);
box(0, 10.2, 83, 33, 1, 19, mats.roof, false);

for (let i = 0; i < 22; i++) {
  const x = Math.random() * 190 - 95;
  const z = Math.random() * 190 - 95;

  if (Math.hypot(x, z - 100) < 18) continue;

  box(x, 1, z, 2.8, 2, 2.8, mats.crate);
}

for (let i = -4; i <= 4; i++) {
  box(i * 8, .015, 0, .16, .03, 220, mats.stripe, false);
}

// GRACZ
const player = new THREE.Object3D();
scene.add(player);
player.position.set(0, 2, 105);
player.add(camera);

let yaw = 0;
let pitch = 0;
let velY = 0;
let onGround = true;

const keys = {};

let hp = 100;
let kills = 0;
let wave = 1;
let ammo = 30;
let reserve = 120;
let weapon = 1;

let playing = false;
let gameEnded = false;
let reloading = false;

let lastShot = 0;
let shotGap = 260;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

const bots = [];
const enemyOrbs = [];

// BROŃ
function makeWeapon() {
  const group = new THREE.Group();

  const dark = new THREE.MeshStandardMaterial({
    color: 0x202c34,
    metalness: .7,
    roughness: .3
  });

  const glow = new THREE.MeshStandardMaterial({
    color: 0x54d9e8,
    emissive: 0x168da5,
    emissiveIntensity: 1.2
  });

  const core = new THREE.Mesh(
    new THREE.BoxGeometry(.22, .2, .58),
    dark
  );

  core.position.z = -.18;
  group.add(core);

  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(.055, .07, .34, 12),
    glow
  );

  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, .02, -.53);
  group.add(barrel);

  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(.14, .28, .16),
    dark
  );

  grip.position.set(0, -.2, -.04);
  group.add(grip);

  const light = new THREE.PointLight(0x4de4ff, 0, 5);
  light.position.set(0, .04, -.7);
  group.add(light);

  group.userData.light = light;
  camera.add(group);
  group.position.set(.38, -.32, -.66);

  return group;
}

const gun = makeWeapon();

const muzzle = new THREE.Mesh(
  new THREE.SphereGeometry(.11, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0xffc45c, transparent: true, opacity: 0 })
);

gun.add(muzzle);
muzzle.position.set(0, .03, -.78);

let recoil = 0;
let flashTimer = 0;

function updateHud() {
  $('hp').textContent = hp;
  $('ammo').innerHTML = `${ammo} <em>/ ${reserve}</em>`;
  $('kills').textContent = kills;
  $('wave').textContent = wave;
}

function toast(msg) {
  $('toast').textContent = msg;
  $('toast').style.opacity = 1;

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    $('toast').style.opacity = 0;
  }, 1300);
}

// BOTY
function spawnBot() {
  const bot = new THREE.Group();

  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(.95, 1.25, .65),
    mats.bot
  );

  torso.position.y = 1.05;
  torso.castShadow = true;
  bot.add(torso);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(.34, 14, 12),
    mats.botDark
  );

  head.position.y = 1.95;
  head.castShadow = true;
  bot.add(head);

  const eye = new THREE.Mesh(
    new THREE.BoxGeometry(.25, .07, .04),
    mats.botEye
  );

  eye.position.set(0, 1.98, -.32);
  bot.add(eye);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(.25, .55, .28),
      mats.botDark
    );

    leg.position.set(side * .25, .3, 0);
    bot.add(leg);
  }

  let x, z;

  do {
    x = Math.random() * 180 - 90;
    z = Math.random() * 180 - 90;
  } while (Math.hypot(x - player.position.x, z - player.position.z) < 35);

  bot.position.set(x, 0, z);
  scene.add(bot);

  bots.push({
    mesh: bot,
    hp: 100,
    speed: 2.1 + Math.random() * 1.2,
    shotAt: 0,
    phase: Math.random() * 6
  });
}

function startWave() {
  const count = Math.min(5 + wave * 2, 18);

  for (let i = 0; i < count; i++) {
    spawnBot();
  }

  toast(`FALA ${wave}`);
}

function endGame() {
  if (gameEnded) return;

  gameEnded = true;
  playing = false;

  document.exitPointerLock?.();

  $('finalStats').textContent =
    `Pokonane boty: ${kills} • Fala: ${wave}`;

  $('gameover').classList.remove('hidden');
}

function startGame() {
  hp = 100;
  kills = 0;
  wave = 1;
  ammo = 30;
  reserve = 120;
  gameEnded = false;
  reloading = false;

  for (const b of bots) scene.remove(b.mesh);
  bots.length = 0;

  for (const b of enemyOrbs) scene.remove(b.mesh);
  enemyOrbs.length = 0;

  player.position.set(0, 2, 105);
  yaw = 0;
  pitch = 0;
  velY = 0;

  updateHud();

  $('gameover').classList.add('hidden');
  $('start').classList.add('hidden');

  playing = true;

  if (!matchMedia('(pointer:coarse)').matches) {
    renderer.domElement.requestPointerLock?.();
  }

  startWave();
}

$('play').addEventListener('click', startGame);
$('restart').addEventListener('click', startGame);

// PAUZA
document.addEventListener('pointerlockchange', () => {
  if (
    !document.pointerLockElement &&
    playing &&
    !matchMedia('(pointer:coarse)').matches
  ) {
    playing = false;
    $('start').classList.remove('hidden');
    $('start').querySelector('h1').innerHTML = 'PAUZA <span>FPS</span>';
    $('start').querySelector('.intro').textContent = 'Gra została wstrzymana.';
    $('play').textContent = 'WRÓĆ DO GRY';
  }
});

// KAMERA MYSZĄ
document.addEventListener('mousemove', e => {
  if (!playing || document.pointerLockElement !== renderer.domElement) return;

  yaw -= e.movementX * .0022;
  pitch -= e.movementY * .0022;

  pitch = THREE.MathUtils.clamp(pitch, -1.42, 1.42);

  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch, yaw, 0);
});

// KLAWISZE
window.addEventListener('keydown', e => {
  keys[e.code] = true;

  if (e.code === 'Space') {
    e.preventDefault();
    jump();
  }

  if (e.code === 'KeyR') reload();
  if (e.code === 'Digit1') setWeapon(1);
  if (e.code === 'Digit2') setWeapon(2);
});

window.addEventListener('keyup', e => {
  keys[e.code] = false;
});

window.addEventListener('blur', () => {
  Object.keys(keys).forEach(k => keys[k] = false);
});

function setWeapon(n) {
  weapon = n;
  shotGap = n === 1 ? 260 : 105;

  toast(n === 1 ? 'BLASTER PULSACYJNY' : 'SZYBKI BLASTER');
}

function jump() {
  if (playing && onGround) {
    velY = 8;
    onGround = false;
  }
}

function reload() {
  if (!playing || reloading || ammo === 30 || reserve <= 0) return;

  reloading = true;
  toast('ŁADOWANIE…');

  setTimeout(() => {
    if (!playing) {
      reloading = false;
      return;
    }

    const amount = Math.min(30 - ammo, reserve);

    ammo += amount;
    reserve -= amount;

    reloading = false;
    updateHud();
    toast('GOTOWE');
  }, 850);
}

// STRZELANIE
function shoot() {
  if (!playing || reloading || performance.now() - lastShot < shotGap) return;

  if (ammo <= 0) {
    toast('BRAK AMUNICJI — NACIŚNIJ R');
    return;
  }

  lastShot = performance.now();
  ammo--;
  recoil = .13;
  flashTimer = .07;

  muzzle.material.opacity = 1;
  gun.userData.light.intensity = 7;

  updateHud();

  raycaster.setFromCamera(center, camera);

  const targets = bots.flatMap(b => b.mesh.children);
  const hit = raycaster.intersectObjects(targets, false)[0];

  if (hit) {
    const bot = bots.find(b => b.mesh.children.includes(hit.object));

    if (bot) {
      bot.hp -= weapon === 1 ? 50 : 25;

      if (bot.hp <= 0) {
        scene.remove(bot.mesh);
        bots.splice(bots.indexOf(bot), 1);

        kills++;
        updateHud();

        if (bots.length === 0) {
          wave++;
          reserve = Math.min(reserve + 30, 240);
          ammo = 30;

          updateHud();
          startWave();
        }
      }
    }
  }
}

document.addEventListener('mousedown', e => {
  if (e.button === 0) shoot();
});

// KOLIZJE I RUCH
function blocked(x, z, r = .7) {
  if (Math.abs(x) > 121 - r || Math.abs(z) > 121 - r) return true;

  return obstacles.some(o =>
    Math.abs(x - o.x) < o.hw + r &&
    Math.abs(z - o.z) < o.hd + r
  );
}

// Jedna deklaracja touchMove jest używana przez joystick.
const touchMove = { x: 0, y: 0 };

function movePlayer(dt) {
  const forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const side = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);

  const v = new THREE.Vector3(side, 0, -forward);

  v.x += touchMove.x;
  v.z -= touchMove.y;

  if (v.lengthSq() > 1) v.normalize();

  v.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

  const speed = 12;

  const nx = player.position.x + v.x * speed * dt;
  const nz = player.position.z + v.z * speed * dt;

  if (!blocked(nx, player.position.z)) player.position.x = nx;
  if (!blocked(player.position.x, nz)) player.position.z = nz;

  velY -= 21 * dt;
  player.position.y += velY * dt;

  if (player.position.y <= 2) {
    player.position.y = 2;
    velY = 0;
    onGround = true;
  }
}

// POCISKI BOTÓW
function botShoot(bot) {
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(.16, 12, 10),
    new THREE.MeshStandardMaterial({
      color: 0xff9a42,
      emissive: 0xd94b12,
      emissiveIntensity: 1.5
    })
  );

  orb.position.copy(bot.mesh.position);
  orb.position.y += 1.45;

  const target = camera.getWorldPosition(new THREE.Vector3());
  const dir = target.sub(orb.position).normalize();

  scene.add(orb);

  enemyOrbs.push({
    mesh: orb,
    dir,
    life: 4
  });
}

function updateBots(dt, now) {
  for (const bot of bots) {
    const dx = player.position.x - bot.mesh.position.x;
    const dz = player.position.z - bot.mesh.position.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 8) {
      const nx = bot.mesh.position.x + (dx / (dist || 1)) * bot.speed * dt;
      const nz = bot.mesh.position.z + (dz / (dist || 1)) * bot.speed * dt;

      if (!blocked(nx, bot.mesh.position.z, .65)) bot.mesh.position.x = nx;
      if (!blocked(bot.mesh.position.x, nz, .65)) bot.mesh.position.z = nz;
    }

    bot.mesh.rotation.y = Math.atan2(dx, dz);
    bot.mesh.position.y = Math.sin(now * .005 + bot.phase) * .035;

    if (dist < 48 && now - bot.shotAt > 1700 + Math.random() * 700) {
      botShoot(bot);
      bot.shotAt = now;
    }
  }
}

function updateOrbs(dt) {
  const pos = camera.getWorldPosition(new THREE.Vector3());

  for (let i = enemyOrbs.length - 1; i >= 0; i--) {
    const o = enemyOrbs[i];

    o.mesh.position.addScaledVector(o.dir, 22 * dt);
    o.life -= dt;

    if (o.mesh.position.distanceTo(pos) < 1.25) {
      hp = Math.max(0, hp - 8);
      updateHud();

      scene.remove(o.mesh);
      enemyOrbs.splice(i, 1);

      if (hp <= 0) endGame();
      continue;
    }

    if (o.life <= 0) {
      scene.remove(o.mesh);
      enemyOrbs.splice(i, 1);
    }
  }
}

// ANIMACJA BRONI
function updateGun(dt) {
  recoil = THREE.MathUtils.lerp(recoil, 0, 13 * dt);

  gun.position.z = -.66 + recoil;
  gun.rotation.x = -.04 - recoil * .5;

  if (flashTimer > 0) {
    flashTimer -= dt;
    muzzle.material.opacity = 1;
    gun.userData.light.intensity = 7;
  } else {
    muzzle.material.opacity = 0;
    gun.userData.light.intensity = 0;
  }
}

// PĘTLA GRY
function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), .05);
  const now = performance.now();

  if (playing && !gameEnded) {
    movePlayer(dt);
    updateBots(dt, now);
    updateOrbs(dt);
    updateGun(dt);
  }

  renderer.render(scene, camera);
}

animate();

// ZMIANA ROZMIARU OKNA
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// JOYSTICK
let stickId = null;

const zone = $('stick-zone');
const stick = $('stick');

function stickUpdate(e) {
  const r = zone.getBoundingClientRect();

  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  let dx = e.clientX - cx;
  let dy = e.clientY - cy;

  const max = 38;
  const len = Math.hypot(dx, dy);

  if (len > max) {
    dx = dx / len * max;
    dy = dy / len * max;
  }

  touchMove.x = dx / max;
  touchMove.y = -dy / max;

  stick.style.transform = `translate(${dx}px, ${dy}px)`;
}

zone.addEventListener('pointerdown', e => {
  stickId = e.pointerId;
  zone.setPointerCapture(stickId);
  stickUpdate(e);
});

zone.addEventListener('pointermove', e => {
  if (e.pointerId === stickId) stickUpdate(e);
});

function stopStick() {
  stickId = null;
  touchMove.x = 0;
  touchMove.y = 0;
  stick.style.transform = '';
}

zone.addEventListener('pointerup', stopStick);
zone.addEventListener('pointercancel', stopStick);

// KAMERA NA TELEFONIE
let lookPointerId = null;
let lastLookX = 0;
let lastLookY = 0;

renderer.domElement.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || !playing) return;

  lookPointerId = e.pointerId;
  lastLookX = e.clientX;
  lastLookY = e.clientY;

  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', e => {
  if (e.pointerId !== lookPointerId || !playing) return;

  const dx = e.clientX - lastLookX;
  const dy = e.clientY - lastLookY;

  lastLookX = e.clientX;
  lastLookY = e.clientY;

  yaw -= dx * .004;
  pitch -= dy * .004;

  pitch = THREE.MathUtils.clamp(pitch, -1.42, 1.42);

  camera.rotation.order = 'YXZ';
  camera.rotation.set(pitch, yaw, 0);
});

function stopLook(e) {
  if (e.pointerId === lookPointerId) lookPointerId = null;
}

renderer.domElement.addEventListener('pointerup', stopLook);
renderer.domElement.addEventListener('pointercancel', stopLook);

// PRZYCISKI TELEFONU
$('mobile-fire').addEventListener('pointerdown', e => {
  e.preventDefault();
  shoot();
});

$('mobile-jump').addEventListener('pointerdown', e => {
  e.preventDefault();
  jump();
});

$('mobile-reload').addEventListener('pointerdown', e => {
  e.preventDefault();
  reload();
});

updateHud();
