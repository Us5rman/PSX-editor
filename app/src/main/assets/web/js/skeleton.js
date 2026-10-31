const BONE_TEX_SCALE = 0.7;

function makeBoneTexture(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const k = size / 1024;
  const g = x.createLinearGradient(0, 0, size, size);
  g.addColorStop(0, '#e6dec6');
  g.addColorStop(0.5, '#d8cdb0');
  g.addColorStop(1, '#c9bd9c');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);

  for (let i = 0; i < 90; i++) {
    const px = Math.random() * size, py = Math.random() * size, r = (40 + Math.random() * 220) * k;
    const rg = x.createRadialGradient(px, py, 0, px, py, r);
    const dark = Math.random() < 0.6;
    rg.addColorStop(0, dark ? 'rgba(110,80,45,0.10)' : 'rgba(255,250,235,0.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rg;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }

  const noise = document.createElement('canvas');
  noise.width = noise.height = 256;
  const nx = noise.getContext('2d');
  const id = nx.createImageData(256, 256);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 205 + Math.random() * 50;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  nx.putImageData(id, 0, 0);
  x.globalCompositeOperation = 'multiply';
  x.fillStyle = x.createPattern(noise, 'repeat');
  x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'source-over';

  const pores = Math.floor(70000 * k * k);
  for (let i = 0; i < pores; i++) {
    const a = 0.12 + Math.random() * 0.4;
    x.fillStyle = 'rgba(' + (60 + Math.random() * 30 | 0) + ',' + (42 + Math.random() * 20 | 0) + ',25,' + a + ')';
    x.beginPath();
    x.arc(Math.random() * size, Math.random() * size, (0.7 + Math.random() * 2.4) * k, 0, 6.2832);
    x.fill();
  }

  x.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    let px = Math.random() * size, py = Math.random() * size, ang = Math.random() * 6.28;
    x.strokeStyle = 'rgba(70,48,28,' + (0.25 + Math.random() * 0.35) + ')';
    x.lineWidth = (0.6 + Math.random() * 1.4) * k;
    x.beginPath();
    x.moveTo(px, py);
    const steps = 6 + Math.random() * 18 | 0;
    for (let s = 0; s < steps; s++) {
      ang += (Math.random() - 0.5) * 0.9;
      px += Math.cos(ang) * (4 + Math.random() * 10) * k;
      py += Math.sin(ang) * (4 + Math.random() * 10) * k;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  return c;
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
    const o = mesh(new THREE.SphereGeometry(1, 18, 12), r * 6, r * 3, m);
    o.scale.set(r * sx, r * sy, r * sz);
    return o;
  };
  const bar = (a, b, r0, r1) => {
    const d = new V().subVectors(b, a), len = d.length();
    const o = mesh(new THREE.CylinderGeometry(r1, r0, len, 10, 1), r0 * 6.28, len);
    o.position.copy(a).addScaledVector(d, 0.5);
    o.quaternion.setFromUnitVectors(new V(0, 1, 0), d.normalize());
    return o;
  };
  const down = (len, r0, r1, topBall, botBall) => {
    const g = new THREE.Group();
    g.add(bar(new V(0, 0, 0), new V(0, -len, 0), r0, r1));
    if (topBall) { const t = ball(topBall, 1, 1, 1); g.add(t); }
    if (botBall) { const b = ball(botBall, 1, 0.9, 1); b.position.y = -len; g.add(b); }
    return g;
  };

  const root = new THREE.Group();
  const parts = { thigh: {}, calf: {}, arm: {}, fore: {} };

  const pelvis = new THREE.Group();
  pelvis.position.y = 0.95;
  root.add(pelvis);
  parts.pelvis = pelvis;
  [-1, 1].forEach(sd => {
    const w = ball(1, 0.105, 0.085, 0.045);
    w.position.set(sd * 0.1, 0.03, -0.005);
    w.rotation.set(0.1, sd * 0.45, -sd * 0.35);
    pelvis.add(w);
  });
  const sacrum = mesh(new THREE.ConeGeometry(0.05, 0.14, 12), 0.2, 0.2);
  sacrum.position.set(0, -0.03, -0.045);
  sacrum.rotation.x = Math.PI - 0.25;
  pelvis.add(sacrum);
  const pubis = mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16), 0.3, 0.1);
  pubis.position.set(0, -0.065, 0.05);
  pubis.rotation.x = Math.PI / 2;
  pelvis.add(pubis);

  const spine = new THREE.Group();
  spine.position.y = 0.05;
  pelvis.add(spine);
  parts.spine = spine;
  const nVert = 17;
  const spineZ = i => -0.045 - 0.03 * Math.sin((i / nVert) * Math.PI);
  for (let i = 0; i < nVert; i++) {
    const y = 0.02 + i * 0.0285, z = spineZ(i);
    const r = i < 5 ? 0.027 : 0.022;
    const v = mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.022, 12), r * 6.28, 0.022);
    v.position.set(0, y, z);
    spine.add(v);
    const sp = mesh(new THREE.ConeGeometry(0.008, 0.035, 6), 0.03, 0.03);
    sp.position.set(0, y - 0.004, z - 0.03);
    sp.rotation.x = -Math.PI / 2 - 0.4;
    spine.add(sp);
  }
  for (let i = 0; i < 10; i++) {
    const t = i / 9;
    const y0 = 0.19 + i * 0.027;
    const w = 0.07 + 0.085 * Math.sin(Math.PI * (0.15 + 0.75 * t));
    const zs = -0.06;
    [-1, 1].forEach(sd => {
      const pts = [
        new V(sd * 0.012, y0, zs), new V(sd * w * 0.65, y0 - 0.004, zs), new V(sd * w, y0 - 0.015, zs + 0.075),
        new V(sd * w * 0.65, y0 - 0.04, zs + 0.125), new V(sd * 0.02, y0 - 0.07, zs + 0.14)
      ];
      const curve = new THREE.CatmullRomCurve3(pts);
      spine.add(mesh(new THREE.TubeGeometry(curve, 20, 0.0065, 6, false), curve.getLength(), 0.04));
    });
  }
  const sternum = mesh(new THREE.BoxGeometry(0.03, 0.2, 0.012), 0.08, 0.2);
  sternum.position.set(0, 0.29, 0.084);
  spine.add(sternum);

  const neck = new THREE.Group();
  neck.position.set(0, 0.49, -0.045);
  spine.add(neck);
  for (let i = 0; i < 7; i++) {
    const v = mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.015, 10), 0.1, 0.015);
    v.position.set(0, 0.008 + i * 0.0175, 0.003 * i);
    neck.add(v);
  }

  const head = new THREE.Group();
  head.position.set(0, 0.125, 0.02);
  neck.add(head);
  parts.head = head;
  const skull = ball(0.095, 0.92, 1.05, 1.12);
  skull.position.set(0, 0.085, 0.01);
  head.add(skull);
  const jaw = ball(0.07, 1, 0.55, 1.05);
  jaw.position.set(0, 0.005, 0.04);
  head.add(jaw);
  const chin = ball(0.025, 1.2, 0.8, 0.8);
  chin.position.set(0, -0.012, 0.095);
  head.add(chin);
  [-1, 1].forEach(sd => {
    const eye = ball(0.024, 1, 1.05, 0.7, dark);
    eye.position.set(sd * 0.036, 0.093, 0.083);
    head.add(eye);
    const cheek = ball(0.022, 1, 0.8, 0.7);
    cheek.position.set(sd * 0.056, 0.055, 0.07);
    head.add(cheek);
  });
  const nose = mesh(new THREE.ConeGeometry(0.014, 0.03, 6), 0.05, 0.05, dark);
  nose.position.set(0, 0.062, 0.1);
  nose.rotation.x = Math.PI;
  head.add(nose);
  for (let i = 0; i < 12; i++) {
    const a = (i - 5.5) / 5.5 * 0.9;
    const tooth = mesh(new THREE.BoxGeometry(0.008, 0.012, 0.006), 0.02, 0.02);
    tooth.position.set(Math.sin(a) * 0.045, 0.032, 0.088 * Math.cos(a) + 0.005);
    tooth.rotation.y = a;
    head.add(tooth);
  }

  [-1, 1].forEach(sd => {
    const key = sd < 0 ? 'l' : 'r';
    spine.add(bar(new V(sd * 0.015, 0.47, 0.075), new V(sd * 0.19, 0.465, 0.0), 0.008, 0.008));
    const scap = ball(1, 0.065, 0.085, 0.012);
    scap.position.set(sd * 0.115, 0.38, -0.085);
    scap.rotation.y = sd * 0.35;
    spine.add(scap);

    const shoulder = new THREE.Group();
    shoulder.position.set(sd * 0.2, 0.465, 0);
    spine.add(shoulder);
    parts.arm[key] = shoulder;
    shoulder.add(down(0.3, 0.014, 0.011, 0.022, 0.017));

    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    shoulder.add(elbow);
    parts.fore[key] = elbow;
    const ulna = down(0.27, 0.01, 0.007, 0.012, 0);
    ulna.position.set(-sd * 0.008, 0, -0.01);
    const radius = down(0.25, 0.008, 0.011, 0, 0.011);
    radius.position.set(sd * 0.008, 0, 0.008);
    elbow.add(ulna, radius);

    const hand = new THREE.Group();
    hand.position.y = -0.27;
    elbow.add(hand);
    const carpals = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), 0.1, 0.05);
    carpals.position.y = -0.018;
    hand.add(carpals);
    for (let f = 0; f < 4; f++) {
      const fx = (f - 1.5) * 0.0135;
      const m = down(0.062, 0.0055, 0.005, 0, 0.0055);
      m.position.set(fx, -0.034, 0);
      hand.add(m);
      const p1 = down(0.034, 0.005, 0.0045, 0, 0.0045);
      p1.position.set(fx, -0.096, 0);
      hand.add(p1);
      const p2 = down(0.026, 0.0045, 0.004, 0, 0.004);
      p2.position.set(fx, -0.13, 0);
      hand.add(p2);
    }
    const th = down(0.05, 0.006, 0.005, 0, 0.005);
    th.position.set(sd * 0.03, -0.03, 0.01);
    th.rotation.z = sd * 0.6;
    hand.add(th);

    const hip = new THREE.Group();
    hip.position.set(sd * 0.085, -0.03, 0);
    pelvis.add(hip);
    parts.thigh[key] = hip;
    hip.add(ball(0.026, 1, 1, 1));
    hip.add(bar(new V(-sd * 0.04, 0.01, 0), new V(0, -0.05, 0), 0.012, 0.014));
    hip.add(bar(new V(0, -0.05, 0), new V(0, -0.43, 0), 0.018, 0.016));
    const cond = ball(0.028, 1, 0.9, 1);
    cond.position.y = -0.43;
    hip.add(cond);

    const knee = new THREE.Group();
    knee.position.y = -0.43;
    hip.add(knee);
    parts.calf[key] = knee;
    const pat = ball(1, 0.022, 0.026, 0.012);
    pat.position.set(0, 0.0, 0.032);
    knee.add(pat);
    knee.add(down(0.4, 0.018, 0.014, 0.026, 0.02));
    const fib = down(0.38, 0.007, 0.006, 0.01, 0.01);
    fib.position.set(sd * 0.03, -0.02, -0.006);
    knee.add(fib);

    const ankle = new THREE.Group();
    ankle.position.y = -0.4;
    knee.add(ankle);
    const talus = ball(0.022, 1, 1, 1);
    talus.position.y = -0.012;
    ankle.add(talus);
    const heel = ball(1, 0.025, 0.022, 0.04);
    heel.position.set(0, -0.045, -0.03);
    ankle.add(heel);
    for (let t = 0; t < 5; t++) {
      const fx = (t - 2) * 0.0135;
      ankle.add(bar(new V(fx, -0.05, 0.03), new V(fx * 1.2, -0.062, 0.125), 0.0065, 0.0055));
      ankle.add(bar(new V(fx * 1.2, -0.062, 0.125), new V(fx * 1.35, -0.066, 0.16 - Math.abs(t - 2) * 0.006), 0.0055, 0.0045));
    }
  });

  root.userData.parts = parts;
  return root;
}
