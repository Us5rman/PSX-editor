const BONE_TEX_SCALE = 0.7;

function makeBoneTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const k = size / 1024;
  const g = x.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#ece3ca');
  g.addColorStop(0.5, '#ddd0ae');
  g.addColorStop(1, '#cdbe97');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);

  for (let i = 0; i < 80; i++) {
    const px = Math.random() * size, py = Math.random() * size, r = (50 + Math.random() * 240) * k;
    const rg = x.createRadialGradient(px, py, 0, px, py, r);
    rg.addColorStop(0, Math.random() < 0.65 ? 'rgba(120,84,40,0.13)' : 'rgba(255,250,236,0.12)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }

  const noise = document.createElement('canvas');
  noise.width = noise.height = 256;
  const nx = noise.getContext('2d');
  const id = nx.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 212 + Math.random() * 43;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  nx.putImageData(id, 0, 0);
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = x.createPattern(noise, 'repeat');
  x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'source-over';

  const buckets = 6, perBucket = Math.floor(7000 * k);
  for (let b = 0; b < buckets; b++) {
    x.fillStyle = 'rgba(' + (62 + b * 6) + ',' + (44 + b * 4) + ',26,' + (0.14 + b * 0.06) + ')';
    x.beginPath();
    for (let i = 0; i < perBucket; i++) {
      const px = Math.random() * size, py = Math.random() * size, r = (0.8 + Math.random() * 2.4) * k;
      x.moveTo(px + r, py);
      x.arc(px, py, r, 0, 6.2832);
    }
    x.fill();
  }

  x.lineCap = 'round';
  for (let b = 0; b < 3; b++) {
    x.strokeStyle = 'rgba(70,48,28,' + (0.22 + b * 0.14) + ')';
    x.lineWidth = (0.7 + b * 0.5) * k;
    x.beginPath();
    for (let i = 0; i < 150; i++) {
      let px = Math.random() * size, py = Math.random() * size, ang = Math.random() * 6.28;
      x.moveTo(px, py);
      const steps = 6 + Math.random() * 16 | 0;
      for (let s = 0; s < steps; s++) {
        ang += (Math.random() - 0.5) * 0.9;
        px += Math.cos(ang) * (4 + Math.random() * 10) * k;
        py += Math.sin(ang) * (4 + Math.random() * 10) * k;
        x.lineTo(px, py);
      }
    }
    x.stroke();
  }
  return c;
}

function mergeMeshes(list, material) {
  let vc = 0, ic = 0;
  list.forEach(m => { vc += m.geometry.attributes.position.count; ic += m.geometry.index.count; });
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), idx = new Uint32Array(ic);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let vo = 0, io = 0;
  list.forEach(m => {
    m.updateMatrix();
    nm.getNormalMatrix(m.matrix);
    const g = m.geometry, p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrix);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      nor[(vo + i) * 3] = v.x; nor[(vo + i) * 3 + 1] = v.y; nor[(vo + i) * 3 + 2] = v.z;
      uv[(vo + i) * 2] = u.getX(i); uv[(vo + i) * 2 + 1] = u.getY(i);
    }
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.getX(i) + vo;
    vo += p.count;
    io += g.index.count;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const out = new THREE.Mesh(geo, material);
  out.castShadow = true;
  out.receiveShadow = true;
  return out;
}

function flattenGroups(g) {
  g.children.slice().forEach(ch => {
    if (!ch.isGroup) return;
    flattenGroups(ch);
    if (!ch.userData.flat) return;
    ch.updateMatrix();
    ch.children.slice().forEach(m => {
      m.updateMatrix();
      m.applyMatrix4(ch.matrix);
      g.add(m);
    });
    g.remove(ch);
  });
}

function mergeTree(g) {
  const byMat = new Map();
  g.children.slice().forEach(ch => {
    if (!ch.isMesh) return;
    if (!byMat.has(ch.material)) byMat.set(ch.material, []);
    byMat.get(ch.material).push(ch);
  });
  byMat.forEach((list, m) => {
    if (list.length < 2) return;
    const merged = mergeMeshes(list, m);
    list.forEach(x => { g.remove(x); x.geometry.dispose(); });
    g.add(merged);
  });
  g.children.slice().forEach(ch => { if (ch.isGroup) mergeTree(ch); });
}

function buildSkeleton(mat) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0807, roughness: 1 });
  const V = THREE.Vector3;

  const scaleUV = (geo, su, sv) => {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    return geo;
  };
  const mesh = (geo, w, h, m) => {
    scaleUV(geo, Math.max(w, 0.02) / BONE_TEX_SCALE, Math.max(h, 0.02) / BONE_TEX_SCALE);
    const o = new THREE.Mesh(geo, m || mat);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };
  const ball = (r, sx, sy, sz, m) => {
    const o = mesh(new THREE.SphereGeometry(1, 16, 11), r * 6, r * 3, m);
    o.scale.set(r * sx, r * sy, r * sz);
    return o;
  };
  const bar = (a, b, r0, r1) => {
    const d = new V().subVectors(b, a), len = d.length();
    const o = mesh(new THREE.CylinderGeometry(r1, r0, len, 9, 1), r0 * 6.28, len);
    o.position.copy(a).addScaledVector(d, 0.5);
    o.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
    return o;
  };
  const down = (len, r0, r1, topBall, botBall) => {
    const g = new THREE.Group();
    g.userData.flat = true;
    g.add(bar(new V(0, 0, 0), new V(0, -len, 0), r0, r1));
    if (topBall) g.add(ball(topBall, 1, 1, 1));
    if (botBall) { const b = ball(botBall, 1, 0.9, 1); b.position.y = -len; g.add(b); }
    return g;
  };

  const root = new THREE.Group();
  const parts = { thigh: {}, calf: {}, arm: {}, fore: {} };

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.93;
  root.add(pelvis);
  parts.pelvis = pelvis;
  [-1, 1].forEach(sd => {
    const w = ball(1, 0.095, 0.085, 0.022);
    w.position.set(sd * 0.105, 0.035, -0.012);
    w.rotation.set(0.15, sd * 0.75, -sd * 0.3);
    pelvis.add(w);
    const ischium = ball(0.024, 1, 1, 1);
    ischium.position.set(sd * 0.06, -0.095, -0.01);
    pelvis.add(ischium);
    const socket = ball(0.032, 1, 1, 1);
    socket.position.set(sd * 0.088, -0.035, 0);
    pelvis.add(socket);
  });
  const sacrum = mesh(new THREE.ConeGeometry(0.055, 0.15, 12), 0.2, 0.2);
  sacrum.position.set(0, -0.025, -0.058);
  sacrum.rotation.x = Math.PI - 0.25;
  pelvis.add(sacrum);
  const pubis = mesh(new THREE.TorusGeometry(0.052, 0.015, 8, 18), 0.3, 0.1);
  pubis.position.set(0, -0.075, 0.055);
  pubis.rotation.x = Math.PI / 2;
  pelvis.add(pubis);

  const spine = new THREE.Group();
  spine.position.y = 0.05;
  pelvis.add(spine);
  parts.spine = spine;
  const nVert = 17;
  const spineZ = i => -0.045 - 0.04 * Math.sin((i / nVert) * Math.PI);
  for (let i = 0; i < nVert; i++) {
    const y = 0.02 + i * 0.0285, z = spineZ(i);
    const r = i < 5 ? 0.031 : 0.026;
    const v = mesh(new THREE.CylinderGeometry(r, r * 1.06, 0.022, 10), r * 6.28, 0.022);
    v.position.set(0, y, z);
    spine.add(v);
    const sp = mesh(new THREE.ConeGeometry(0.009, 0.04, 6), 0.03, 0.03);
    sp.position.set(0, y - 0.004, z - 0.034);
    sp.rotation.x = -Math.PI / 2 - 0.4;
    spine.add(sp);
  }
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const y0 = 0.19 + i * 0.027;
    const w = 0.085 + 0.09 * Math.sin(Math.PI * (0.15 + 0.75 * t));
    const zs = -0.065;
    [-1, 1].forEach(sd => {
      const pts = [
        new V(sd * 0.012, y0, zs), new V(sd * w * 0.65, y0 - 0.004, zs), new V(sd * w, y0 - 0.015, zs + 0.08),
        new V(sd * w * 0.65, y0 - 0.04, zs + 0.135), new V(sd * 0.02, y0 - 0.07, zs + 0.15)
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      spine.add(mesh(new THREE.TubeGeometry(curve, 16, 0.0105, 7, false), curve.getLength(), 0.05));
    });
  }
  const sternum = mesh(new THREE.BoxGeometry(0.04, 0.22, 0.014), 0.08, 0.2);
  sternum.position.set(0, 0.29, 0.09);
  spine.add(sternum);

  const neck = new THREE.Group();
  neck.position.set(0, 0.49, -0.05);
  spine.add(neck);
  for (let i = 0; i < 7; i++) {
    const v = mesh(new THREE.CylinderGeometry(0.018, 0.019, 0.015, 9), 0.1, 0.015);
    v.position.set(0, 0.008 + i * 0.0175, 0.004 * i);
    neck.add(v);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.125, 0.026);
  head.rotation.x = 0.12;
  neck.add(head);
  parts.head = head;
  const skull = ball(1, 0.112, 0.122, 0.13);
  skull.position.set(0, 0.115, 0.005);
  head.add(skull);
  const maxilla = ball(1, 0.07, 0.06, 0.075);
  maxilla.position.set(0, 0.045, 0.085);
  head.add(maxilla);
  const brow = mesh(new THREE.BoxGeometry(0.15, 0.022, 0.05), 0.15, 0.05);
  brow.position.set(0, 0.125, 0.092);
  head.add(brow);
  [-1, 1].forEach(sd => {
    const eye = ball(1, 0.037, 0.041, 0.03, dark);
    eye.position.set(sd * 0.042, 0.098, 0.108);
    head.add(eye);
    const cheek = ball(1, 0.03, 0.018, 0.025);
    cheek.position.set(sd * 0.068, 0.06, 0.088);
    head.add(cheek);
  });
  const nose = ball(1, 0.013, 0.022, 0.012, dark);
  nose.position.set(0, 0.058, 0.13);
  head.add(nose);
  for (let i = 0; i < 10; i++) {
    const a = (i - 4.5) / 4.5 * 0.85;
    const tooth = mesh(new THREE.BoxGeometry(0.0095, 0.016, 0.007), 0.02, 0.02);
    tooth.position.set(Math.sin(a) * 0.048, 0.016, 0.095 * Math.cos(a) + 0.01);
    tooth.rotation.y = a;
    head.add(tooth);
  }

  const jaw = new THREE.Group();
  jaw.position.set(0, 0.03, 0.0);
  jaw.rotation.x = 0.3;
  head.add(jaw);
  const mand = mesh(new THREE.TorusGeometry(0.058, 0.014, 8, 22, Math.PI), 0.3, 0.1);
  mand.rotation.x = Math.PI / 2;
  mand.position.set(0, -0.025, 0.03);
  jaw.add(mand);
  const chin = ball(1, 0.03, 0.022, 0.022);
  chin.position.set(0, -0.025, 0.09);
  jaw.add(chin);
  [-1, 1].forEach(sd => jaw.add(bar(new V(sd * 0.058, -0.025, 0.03), new V(sd * 0.064, 0.02, -0.002), 0.012, 0.012)));
  for (let i = 0; i < 10; i++) {
    const a = (i - 4.5) / 4.5 * 0.85;
    const tooth = mesh(new THREE.BoxGeometry(0.0095, 0.015, 0.007), 0.02, 0.02);
    tooth.position.set(Math.sin(a) * 0.05, -0.012, 0.09 * Math.cos(a) + 0.01);
    tooth.rotation.y = a;
    jaw.add(tooth);
  }

  [-1, 1].forEach(sd => {
    const key = sd < 0 ? 'l' : 'r';
    spine.add(bar(new V(sd * 0.015, 0.47, 0.085), new V(sd * 0.195, 0.465, 0.0), 0.011, 0.011));
    const scap = ball(1, 0.075, 0.095, 0.014);
    scap.position.set(sd * 0.12, 0.38, -0.092);
    scap.rotation.y = sd * 0.35;
    spine.add(scap);

    const shoulder = new THREE.Group();
    shoulder.position.set(sd * 0.205, 0.465, 0);
    shoulder.rotation.x = -0.12;
    spine.add(shoulder);
    parts.arm[key] = shoulder;
    shoulder.add(down(0.31, 0.017, 0.0135, 0.03, 0.022));

    const elbow = new THREE.Group();
    elbow.position.y = -0.31;
    elbow.rotation.x = -0.45;
    shoulder.add(elbow);
    parts.fore[key] = elbow;
    const ulna = down(0.27, 0.0125, 0.008, 0.015, 0);
    ulna.position.set(-sd * 0.009, 0, -0.011);
    const radius = down(0.25, 0.01, 0.013, 0, 0.013);
    radius.position.set(sd * 0.009, 0, 0.009);
    elbow.add(ulna, radius);

    const hand = new THREE.Group();
    hand.position.y = -0.27;
    elbow.add(hand);
    const carpals = mesh(new THREE.BoxGeometry(0.055, 0.032, 0.022), 0.1, 0.05);
    carpals.position.y = -0.018;
    hand.add(carpals);
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.0145;
      const m = down(0.062, 0.0065, 0.006, 0, 0.0065);
      m.position.set(fx, -0.034, 0);
      hand.add(m);
      const p1 = down(0.034, 0.006, 0.0055, 0, 0.0055);
      p1.position.set(fx, -0.096, 0);
      p1.rotation.x = -0.25;
      hand.add(p1);
      const p2 = down(0.026, 0.0055, 0.005, 0, 0.005);
      p2.position.set(fx, -0.128, -0.008);
      p2.rotation.x = -0.45;
      hand.add(p2);
    }
    const th = down(0.05, 0.007, 0.006, 0, 0.006);
    th.position.set(sd * 0.032, -0.03, 0.01);
    th.rotation.z = sd * 0.6;
    hand.add(th);

    const hip = new THREE.Group();
    hip.position.set(sd * 0.088, -0.035, 0);
    hip.rotation.x = -0.08;
    pelvis.add(hip);
    parts.thigh[key] = hip;
    hip.add(ball(0.03, 1, 1, 1));
    hip.add(bar(new V(-sd * 0.045, 0.012, 0), new V(0, -0.05, 0), 0.014, 0.017));
    hip.add(bar(new V(0, -0.05, 0), new V(0, -0.43, 0), 0.021, 0.018));
    const cond = ball(0.036, 1, 0.9, 1);
    cond.position.y = -0.43;
    hip.add(cond);

    const knee = new THREE.Group();
    knee.position.y = -0.43;
    knee.rotation.x = 0.16;
    hip.add(knee);
    parts.calf[key] = knee;
    const pat = ball(1, 0.026, 0.03, 0.015);
    pat.position.set(0, 0.0, 0.036);
    knee.add(pat);
    knee.add(down(0.4, 0.02, 0.016, 0.03, 0.024));
    const fib = down(0.38, 0.008, 0.007, 0.012, 0.012);
    fib.position.set(sd * 0.034, -0.02, -0.007);
    knee.add(fib);

    const ankle = new THREE.Group();
    ankle.position.y = -0.4;
    ankle.rotation.x = -0.08;
    knee.add(ankle);
    const talus = ball(0.026, 1, 1, 1);
    talus.position.y = -0.012;
    ankle.add(talus);
    const heel = ball(1, 0.03, 0.026, 0.045);
    heel.position.set(0, -0.045, -0.032);
    ankle.add(heel);
    for (let t = 0; t < 5; t++) {
      const fx = (t - 2) * 0.015;
      ankle.add(bar(new V(fx, -0.05, 0.03), new V(fx * 1.2, -0.064, 0.13), 0.0075, 0.0065));
      ankle.add(bar(new V(fx * 1.2, -0.064, 0.13), new V(fx * 1.35, -0.068, 0.168 - Math.abs(t - 2) * 0.006), 0.0065, 0.0055));
    }
  });

  flattenGroups(root);
  mergeTree(root);
  root.userData.parts = parts;
  return root;
}
