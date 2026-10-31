function pakPick(paths) {
  return new Promise(done => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    const h = document.createElement('h3');
    h.textContent = 'Pick a skin to load';
    sheet.appendChild(h);
    const close = v => { wrap.remove(); done(v); };
    paths.forEach(p => {
      const b = document.createElement('button');
      b.className = 'item';
      b.textContent = p.split('/').slice(-3).join(' / ');
      b.onclick = () => close(p);
      sheet.appendChild(b);
    });
    const c = document.createElement('button');
    c.className = 'item';
    c.textContent = 'Cancel';
    c.onclick = () => close(null);
    sheet.appendChild(c);
    wrap.appendChild(sheet);
    wrap.onclick = e => { if (e.target === wrap) close(null); };
    document.body.appendChild(wrap);
  });
}

async function loadPakModel(file) {
  toast('Reading pak...');
  const pak = await UEPak.openPak(UEPak.Src.fromBlob(file));
  toast('Looking for skins...');
  const meshes = await UEPak.listSkeletalMeshes(pak, (a, b) => toast('Looking for skins... ' + a + '/' + b));
  if (!meshes.length) throw new Error('No skeletal mesh found in this pak');
  const pick = meshes.length === 1 ? meshes[0] : await pakPick(meshes);
  if (!pick) return null;
  const res = await UEPak.loadSkinMesh(pak, pick, s => toast('Loading ' + s));
  if (res.warn.length) console.warn('pak import:', res.warn);
  toast('Building model...');
  await new Promise(r => setTimeout(r, 30));
  return { root: UEPak.buildThree(res), name: pick.split('/').pop(), rigged: !!res.mesh.skin };
}
