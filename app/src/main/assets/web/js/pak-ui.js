function pakToast(text) {
  let el = document.getElementById('pakToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pakToast';
    el.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 90px);transform:translateX(-50%);' +
      'max-width:86vw;padding:9px 14px;border-radius:14px;background:var(--p);color:var(--t);border:1px solid var(--l);' +
      'font-size:13px;z-index:60;box-shadow:0 4px 18px #0004;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = '';
  clearTimeout(el._t);
  const f = t => { el.textContent = t; el.style.display = ''; clearTimeout(el._t); };
  f.done = (ms, t) => {
    if (t) el.textContent = t;
    el._t = setTimeout(() => { el.style.display = 'none'; }, ms || 0);
  };
  return f;
}

function pakPick(paths) {
  return new Promise(ok => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:#0007;z-index:70;display:flex;align-items:center;justify-content:center;padding:18px';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--p);color:var(--t);border:1px solid var(--l);border-radius:16px;padding:14px;' +
      'width:100%;max-width:420px;max-height:80vh;overflow:auto;display:flex;flex-direction:column;gap:8px';
    const h = document.createElement('div');
    h.textContent = TT('Pick a skin to load', 'یک اسکین را انتخاب کنید');
    h.style.cssText = 'font-size:14px;margin-bottom:2px';
    box.appendChild(h);
    const close = v => { wrap.remove(); ok(v); };
    paths.forEach(p => {
      const b = document.createElement('button');
      const parts = p.split('/');
      b.textContent = parts.slice(-3).join(' / ');
      b.style.cssText = 'text-align:start;white-space:normal;word-break:break-all';
      b.onclick = () => close(p);
      box.appendChild(b);
    });
    const c = document.createElement('button');
    c.textContent = TT('Cancel', 'انصراف');
    c.onclick = () => close(null);
    box.appendChild(c);
    wrap.appendChild(box);
    wrap.onclick = e => { if (e.target === wrap) close(null); };
    document.body.appendChild(wrap);
  });
}

async function pakImport(file) {
  const say = pakToast(TT('Reading pak...', 'در حال خواندن pak...'));
  try {
    const pak = await UEPak.openPak(UEPak.Src.fromBlob(file));
    say(TT('Looking for skins...', 'در حال جستجوی اسکین...'));
    const meshes = await UEPak.listSkeletalMeshes(pak, (a, b) => say(TT('Looking for skins... ', 'در حال جستجوی اسکین... ') + a + '/' + b));
    if (!meshes.length) throw new Error(TT('No skeletal mesh found in this pak', 'هیچ مدل اسکلتی در این pak پیدا نشد'));
    const pick = meshes.length == 1 ? meshes[0] : await pakPick(meshes);
    if (!pick) { say.done(0); return; }
    const res = await UEPak.loadSkinMesh(pak, pick, s => say(TT('Loading ', 'در حال بارگذاری ') + s));
    say(TT('Building model...', 'در حال ساخت مدل...'));
    await new Promise(r => setTimeout(r, 30));
    autoRig(UEPak.buildThree(res));
    if (res.warn.length) console.warn('pak import:', res.warn);
    say.done(2500, TT('Loaded: ', 'بارگذاری شد: ') + pick.split('/').pop());
  } catch (e) {
    console.error(e);
    RIG.err = String(e.message || e);
    try { render(); } catch (x) { }
    say.done(6000, String(e.message || e));
  }
}
