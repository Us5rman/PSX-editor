(function (root) {
  'use strict';

  const PAK_MAGIC = 0x5A6F12E1;
  const PKG_TAG = 0x9E2A83C1;

  class Rd {
    constructor(u8, p) {
      this.u8 = u8;
      this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      this.p = p || 0;
    }
    get len() { return this.u8.length; }
    skip(n) { this.p += n; }
    u8_() { return this.dv.getUint8(this.p++); }
    u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
    i32() { const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
    u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
    f32() { const v = this.dv.getFloat32(this.p, true); this.p += 4; return v; }
    u64() {
      const lo = this.dv.getUint32(this.p, true), hi = this.dv.getUint32(this.p + 4, true);
      this.p += 8;
      return hi * 4294967296 + lo;
    }
    bytes(n) { const b = this.u8.subarray(this.p, this.p + n); this.p += n; return b; }
    fstr() {
      const n = this.i32();
      if (n === 0) return '';
      let s = '';
      if (n < 0) {
        const c = -n;
        for (let i = 0; i < c - 1; i++) s += String.fromCharCode(this.dv.getUint16(this.p + i * 2, true));
        this.p += c * 2;
      } else {
        for (let i = 0; i < n - 1; i++) s += String.fromCharCode(this.u8[this.p + i]);
        this.p += n;
      }
      return s;
    }
  }

  const Src = {
    fromBlob(b) {
      return { size: b.size, read: async (o, l) => new Uint8Array(await b.slice(o, o + l).arrayBuffer()) };
    },
    fromBuffer(buf) {
      return { size: buf.length, read: async (o, l) => buf.subarray(o, o + l) };
    }
  };

  async function inflate(u8) {
    const ds = new DecompressionStream('deflate');
    const w = ds.writable.getWriter();
    w.write(u8);
    w.close();
    return new Uint8Array(await new Response(ds.readable).arrayBuffer());
  }

  function entryHeaderSize(comp, blocks) {
    return 8 * 3 + 4 + 20 + (comp ? 4 + 16 * blocks : 0) + 1 + 4;
  }

  function readClassicEntry(r, ver, compNames) {
    const e = {};
    e.offset = r.u64();
    e.size = r.u64();
    e.usize = r.u64();
    const c = r.u32();
    if (ver <= 1) r.skip(8);
    r.skip(20);
    let nb = 0;
    e.blocks = null;
    if (ver >= 3) {
      if (c !== 0) {
        nb = r.u32();
        e.blocks = [];
        for (let i = 0; i < nb; i++) e.blocks.push([r.u64(), r.u64()]);
      }
      const flags = r.u8_();
      e.encrypted = (flags & 1) !== 0;
      e.blockSize = r.u32();
    }
    e.comp = ver >= 8 ? (compNames[c] || (c ? 'Unknown' : null)) : (c ? (c & 1 ? 'Zlib' : 'Unknown') : null);
    e.relBlocks = ver >= 5;
    e.hdr = entryHeaderSize(c, nb);
    return e;
  }

  function decodeEncodedEntry(r, compNames) {
    const v = r.u32();
    const e = {};
    const ci = (v >>> 23) & 0x3f;
    e.encrypted = (v & (1 << 22)) !== 0;
    const nb = (v >>> 6) & 0xffff;
    let bs = v & 0x3f;
    if (bs === 0x3f) bs = r.u32(); else bs = bs << 11;
    e.blockSize = bs;
    e.offset = (v & 0x80000000) ? r.u32() : r.u64();
    e.usize = (v & 0x40000000) ? r.u32() : r.u64();
    if (ci) e.size = (v & 0x20000000) ? r.u32() : r.u64(); else e.size = e.usize;
    e.comp = ci ? (compNames[ci] || 'Unknown') : null;
    e.hdr = entryHeaderSize(ci, nb);
    e.relBlocks = true;
    e.blocks = null;
    if (nb > 0) {
      let start = e.hdr;
      e.blocks = [];
      if (nb === 1 && !e.encrypted) {
        e.blocks.push([start, start + e.size]);
      } else {
        for (let i = 0; i < nb; i++) {
          const s = r.u32();
          e.blocks.push([start, start + s]);
          start += s;
        }
      }
    }
    return e;
  }

  function normPath(p) {
    return p.replace(/\\/g, '/').replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
  }

  async function openPak(src) {
    const tl = Math.min(512, src.size);
    const tail = await src.read(src.size - tl, tl);
    const tdv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let m = -1;
    for (let i = tail.length - 24; i >= 0; i--) {
      if (tdv.getUint32(i, true) === PAK_MAGIC) {
        const v = tdv.getUint32(i + 4, true);
        if (v >= 1 && v <= 12) { m = i; break; }
      }
    }
    if (m < 0) throw new Error('Not an Unreal pak file');
    const ver = tdv.getUint32(m + 4, true);
    const idxOff = tdv.getUint32(m + 8, true) + tdv.getUint32(m + 12, true) * 4294967296;
    const idxSize = tdv.getUint32(m + 16, true) + tdv.getUint32(m + 20, true) * 4294967296;
    if (ver >= 4 && tail[m - 1] === 1) throw new Error('This pak has an encrypted index (AES key required)');

    const compNames = [null];
    if (ver >= 8) {
      let q = m + 24 + 20;
      if (ver === 9) q += 1;
      for (; q + 32 <= tail.length; q += 32) {
        let s = '';
        for (let i = 0; i < 32 && tail[q + i]; i++) s += String.fromCharCode(tail[q + i]);
        compNames.push(s);
      }
    }

    const index = await src.read(idxOff, idxSize);
    const r = new Rd(index);
    const mount = normPath(r.fstr());
    const files = new Map();

    if (ver < 10) {
      const count = r.u32();
      for (let i = 0; i < count; i++) {
        const name = r.fstr();
        const e = readClassicEntry(r, ver, compNames);
        files.set((mount + name).toLowerCase(), Object.assign(e, { path: mount + name }));
      }
    } else {
      r.i32();
      r.u64();
      if (r.u32()) { r.skip(16); r.skip(20); }
      let fullOff = 0, fullSize = 0;
      if (r.u32()) { fullOff = r.u64(); fullSize = r.u64(); r.skip(20); }
      const encLen = r.i32();
      const enc = r.bytes(encLen);
      const nonEnc = [];
      const ne = r.i32();
      for (let i = 0; i < ne; i++) nonEnc.push(readClassicEntry(r, ver, compNames));
      if (!fullSize) throw new Error('Pak has no full directory index');
      const fr = new Rd(await src.read(fullOff, fullSize));
      const dirs = fr.i32();
      for (let d = 0; d < dirs; d++) {
        const dir = fr.fstr();
        const n = fr.i32();
        for (let k = 0; k < n; k++) {
          const name = fr.fstr();
          const eo = fr.i32();
          const e = eo >= 0 ? decodeEncodedEntry(new Rd(enc, eo), compNames) : nonEnc[-eo - 1];
          const full = normPath(mount + dir + name);
          files.set(full.toLowerCase(), Object.assign(e, { path: full }));
        }
      }
    }
    return { src, version: ver, mount, files };
  }

  async function readEntry(pak, e) {
    if (e.encrypted) throw new Error('Encrypted pak entries are not supported');
    if (!e.comp) return pak.src.read(e.offset + e.hdr, e.size);
    if (e.comp !== 'Zlib') throw new Error('Unsupported pak compression: ' + e.comp);
    const base = e.relBlocks ? e.offset : 0;
    const parts = [];
    let total = 0;
    for (const b of e.blocks) {
      const raw = await pak.src.read(base + b[0], b[1] - b[0]);
      const out = await inflate(raw);
      parts.push(out);
      total += out.length;
    }
    const all = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    return all;
  }

  function findFile(pak, path) {
    return pak.files.get(path.toLowerCase());
  }

  function pkgToPath(pak, pkg) {
    if (!pak.contentIndex) {
      pak.contentIndex = new Map();
      for (const [k, e] of pak.files) {
        const i = k.indexOf('/content/');
        if (i >= 0) pak.contentIndex.set(k.slice(i + 9), e);
      }
    }
    return pkg;
  }

  function findAsset(pak, pkg, ext) {
    pkgToPath(pak, pkg);
    let rel = pkg.replace(/^\/Game\//i, '').toLowerCase();
    if (rel === pkg.toLowerCase()) return null;
    return pak.contentIndex.get(rel + ext) || null;
  }

  function parsePackage(u8) {
    const r = new Rd(u8);
    if (r.u32() !== PKG_TAG) throw new Error('Not a package file');
    const legacy = r.i32();
    if (legacy < -7) throw new Error('UE5 assets are not supported yet');
    if (legacy !== -4) r.i32();
    r.i32();
    r.i32();
    if (legacy <= -2) { const n = r.i32(); r.skip(n * 20); }
    const total = r.i32();
    r.fstr();
    const flags = r.u32();
    const nameCount = r.i32(), nameOff = r.i32();
    if (!(flags & 0x80000000)) r.fstr();
    r.skip(8);
    const expCount = r.i32(), expOff = r.i32();
    const impCount = r.i32(), impOff = r.i32();

    const names = [];
    r.p = nameOff;
    for (let i = 0; i < nameCount; i++) { names.push(r.fstr()); r.skip(4); }

    const imports = [];
    const impStride = (flags & 0x80000000) ? 28 : 36;
    r.p = impOff;
    for (let i = 0; i < impCount; i++) {
      const p0 = r.p;
      const cp = r.i32(); r.i32();
      const cn = r.i32(); r.i32();
      const outer = r.i32();
      const on = r.i32(); r.i32();
      imports.push({ classPkg: names[cp], cls: names[cn], outer, name: names[on] });
      r.p = p0 + impStride;
    }

    const exports = [];
    const strides = [104, 100, 108, 112, 96, 92];
    for (const st of strides) {
      const list = [];
      let ok = true;
      for (let i = 0; i < expCount; i++) {
        r.p = expOff + i * st;
        const ci = r.i32(), si = r.i32(), ti = r.i32(), oi = r.i32();
        const nm = r.i32(); r.i32();
        r.u32();
        const size = r.u64(), off = r.u64();
        if (off < total || off > total + 1e10 || size < 0 || nm >= names.length) { ok = false; break; }
        list.push({ classIndex: ci, outer: oi, name: names[nm], size, offset: off });
      }
      if (ok) { exports.push(...list); break; }
    }
    if (expCount && !exports.length) throw new Error('Could not read the export table');
    for (const e of exports) {
      e.cls = e.classIndex < 0 && imports[-e.classIndex - 1] ? imports[-e.classIndex - 1].name : '';
    }
    return { names, imports, exports, total, flags };
  }

  function readProps(r, names) {
    const out = {};
    for (;;) {
      const nm = names[r.i32()]; r.i32();
      if (nm === undefined || nm === 'None') break;
      const type = names[r.i32()]; r.i32();
      const size = r.i32();
      r.i32();
      let sname = '', enm = '', inner = '', boolv = false;
      if (type === 'StructProperty') { sname = names[r.i32()]; r.i32(); r.skip(16); }
      else if (type === 'BoolProperty') boolv = r.u8_() !== 0;
      else if (type === 'ByteProperty' || type === 'EnumProperty') { enm = names[r.i32()]; r.i32(); }
      else if (type === 'ArrayProperty' || type === 'SetProperty') { inner = names[r.i32()]; r.i32(); }
      else if (type === 'MapProperty') { r.skip(16); }
      if (r.u8_()) r.skip(16);
      const start = r.p;
      let val = null;
      try { val = readValue(r, names, type, sname, enm, inner, boolv, size); } catch (e) { val = null; }
      r.p = start + size;
      out[nm] = val;
    }
    return out;
  }

  function readValue(r, names, type, sname, enm, inner, boolv, size) {
    switch (type) {
      case 'ObjectProperty': return r.i32();
      case 'NameProperty': { const v = names[r.i32()]; r.i32(); return v; }
      case 'IntProperty': return r.i32();
      case 'FloatProperty': return r.f32();
      case 'BoolProperty': return boolv;
      case 'StrProperty': return r.fstr();
      case 'EnumProperty': { const v = names[r.i32()]; r.i32(); return v; }
      case 'ByteProperty':
        if (enm === 'None') return r.u8_();
        { const v = names[r.i32()]; r.i32(); return v; }
      case 'StructProperty':
        if (sname === 'Guid' || sname === 'LinearColor' || sname === 'Vector' || sname === 'Quat' || sname === 'Color' ||
            sname === 'Vector2D' || sname === 'Rotator' || sname === 'IntPoint' || sname === 'Vector4') return null;
        return readProps(r, names);
      case 'ArrayProperty': {
        const n = r.i32();
        const arr = [];
        if (inner === 'StructProperty') {
          r.skip(8 + 8 + 4 + 4 + 8 + 16 + 1);
          for (let i = 0; i < n; i++) arr.push(readProps(r, names));
        } else if (inner === 'ObjectProperty' || inner === 'IntProperty') {
          for (let i = 0; i < n; i++) arr.push(r.i32());
        }
        return arr;
      }
      default: return null;
    }
  }

  function exportReader(uasset, uexp, pk, exp) {
    const buf = new Uint8Array(uexp.length);
    buf.set(uexp);
    return new Rd(buf, exp.offset - pk.total);
  }

  async function loadPackage(pak, base) {
    const ua = findFile(pak, base + '.uasset');
    const ux = findFile(pak, base + '.uexp');
    if (!ua) return null;
    const uasset = await readEntry(pak, ua);
    const pk = parsePackage(uasset);
    let uexp = ux ? await readEntry(pak, ux) : null;
    if (!uexp) {
      const first = pk.exports[0];
      uexp = uasset.subarray(first ? first.offset : uasset.length);
      pk.total = first ? first.offset : 0;
    }
    return { pk, uasset, uexp, base };
  }

  async function listSkeletalMeshes(pak, onProgress) {
    const res = [];
    const cands = [];
    for (const [k, e] of pak.files) {
      if (!k.endsWith('.uasset') || e.usize > 400000) continue;
      const ux = pak.files.get(k.slice(0, -7) + '.uexp');
      if (ux && ux.usize > 40000) cands.push({ k, e, big: ux.usize });
    }
    cands.sort((a, b) => b.big - a.big);
    let n = 0;
    for (const c of cands.slice(0, 600)) {
      try {
        const pk = parsePackage(await readEntry(pak, c.e));
        if (pk.exports.some(x => x.cls === 'SkeletalMesh')) res.push(c.e.path.replace(/\.uasset$/i, ''));
      } catch (err) { /* not a readable package */ }
      if (onProgress && (++n % 20 === 0)) onProgress(n, cands.length);
    }
    return res;
  }

  function findMeshStart(u8, from, nb, nMats, names) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const variants = [];
    for (const mask of [1, 0]) for (const dis of [4, 0]) for (const cl of [20, 16, 24]) variants.push({ mask, dis, cl });
    for (let q = from; q < from + 1500; q++) {
      const ns = dv.getInt32(q, true);
      if (ns < 1 || ns > 200) continue;
      for (const v of variants) {
        const res = trySections(u8, dv, q, nb, nMats, v);
        if (res) return res;
      }
    }
    return null;
  }

  function trySections(u8, dv, q, nb, nMats, v) {
    const r = new Rd(u8, q);
    try {
      const ns = r.i32();
      const secs = [];
      let vsum = 0;
      for (let k = 0; k < ns; k++) {
        r.skip(2);
        const mat = r.u16();
        const base = r.u32();
        const ntri = r.u32();
        r.skip(4);
        if (v.mask) r.skip(1);
        r.skip(4);
        const bv = r.u32();
        const cm = r.i32();
        if (cm < 0 || cm > 1000000) return null;
        r.skip(cm * 64);
        const nbm = r.i32();
        if (nbm < 0 || nbm > nb) return null;
        const bmStart = r.p;
        r.skip(nbm * 2);
        const nv = r.i32();
        const mbi = r.i32();
        r.skip(2 + v.cl);
        const nd = r.u32();
        if (nd > 5000000) return null;
        r.skip(nd * 4);
        const ni = r.u32();
        if (ni > 5000000) return null;
        r.skip(ni * 8);
        r.skip(v.dis);
        if (mat >= nMats || base % 3 !== 0 || ntri <= 0 || nv <= 0 || bv !== vsum || mbi < 1 || mbi > 16) return null;
        vsum += nv;
        secs.push({ mat, base, ntri, bv, nv, bmStart, nbm });
      }
      return { secs, end: r.p, nVerts: vsum };
    } catch (e) {
      return null;
    }
  }

  function scan(dv, from, to, test) {
    for (let q = from; q < to; q++) {
      if (q + 40 > dv.byteLength) return -1;
      if (test(q)) return q;
    }
    return -1;
  }

  function parseSkeletalMesh(uexp, pk) {
    const exp = pk.exports.find(e => e.cls === 'SkeletalMesh');
    if (!exp) throw new Error('No skeletal mesh in this asset');
    const r = exportReader(null, uexp, pk, exp);
    const u8 = r.u8, dv = r.dv, names = pk.names;
    readProps(r, names);
    r.skip(4);
    r.skip(2);
    r.skip(28);
    const nMats = r.i32();
    if (nMats < 0 || nMats > 500) throw new Error('Unexpected mesh layout (materials)');
    const matStart = r.p;
    const mats = [];
    let boneStart = -1, nb = 0;
    for (const st of [40, 36, 44, 32, 48, 52, 56, 60, 64]) {
      const q = matStart + nMats * st;
      if (q + 20 > u8.length) continue;
      const n = dv.getUint32(q, true);
      if (n < 1 || n > 2000) continue;
      const nm0 = dv.getInt32(q + 4, true), par0 = dv.getInt32(q + 12, true);
      if (nm0 < 0 || nm0 >= names.length || par0 !== -1) continue;
      const pc = dv.getUint32(q + 4 + n * 12, true);
      if (pc !== n) continue;
      boneStart = q;
      nb = n;
      for (let i = 0; i < nMats; i++) {
        const rr = new Rd(u8, matStart + i * st);
        const ref = rr.i32();
        const slot = names[rr.i32()] || '';
        mats.push({ ref, slot });
      }
      break;
    }
    if (boneStart < 0) throw new Error('Unexpected mesh layout (skeleton)');
    r.p = boneStart + 4;
    const bones = [];
    for (let i = 0; i < nb; i++) {
      const ni = r.i32();
      r.i32();
      const par = r.i32();
      bones.push({ name: names[ni] || ('bone_' + i), parent: par });
    }
    const np = r.i32();
    for (let i = 0; i < np; i++) {
      const q = [r.f32(), r.f32(), r.f32(), r.f32()];
      const t = [r.f32(), r.f32(), r.f32()];
      const sc = [r.f32(), r.f32(), r.f32()];
      if (i < nb) { bones[i].q = q; bones[i].t = t; bones[i].s = sc; }
    }
    const nmap = r.i32();
    r.skip(nmap * 12);

    const found = findMeshStart(u8, r.p, nb, nMats, names);
    if (!found) throw new Error('Unsupported mesh version (render sections not recognised)');
    const secs = found.secs, N = found.nVerts;
    const totIdx = secs.reduce((a, s) => a + s.ntri * 3, 0);

    let q = scan(dv, found.end, found.end + 2048, p => {
      const es = dv.getUint32(p, true);
      return (es === 2 || es === 4) && dv.getUint32(p + 4, true) === totIdx;
    });
    if (q < 0) throw new Error('Index buffer not found');
    const es = dv.getUint32(q, true);
    const idx = new Uint32Array(totIdx);
    let o = q + 8;
    for (let i = 0; i < totIdx; i++, o += es) idx[i] = es === 2 ? dv.getUint16(o, true) : dv.getUint32(o, true);

    q = scan(dv, o, o + 256, p => dv.getUint32(p, true) === 12 && dv.getUint32(p + 4, true) === N &&
      dv.getUint32(p + 8, true) === 12 && dv.getUint32(p + 12, true) === N);
    if (q < 0) throw new Error('Vertex positions not found');
    const pos = new Float32Array(N * 3);
    o = q + 16;
    for (let i = 0; i < N * 3; i++, o += 4) pos[i] = dv.getFloat32(o, true);

    q = scan(dv, o, o + 256, p => {
      const nuv = dv.getUint32(p + 2, true), e2 = dv.getUint32(p + 18, true);
      return nuv >= 1 && nuv <= 8 && dv.getUint32(p + 6, true) === N && (e2 === 8 || e2 === 16) && dv.getUint32(p + 22, true) === N;
    });
    if (q < 0) throw new Error('Tangent buffer not found');
    const nuv = dv.getUint32(q + 2, true);
    const fullUV = dv.getUint32(q + 10, true) !== 0;
    const tes = dv.getUint32(q + 18, true);
    const tanStart = q + 26;
    const nor = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const b = tanStart + i * tes;
      let x, y, z;
      if (tes === 8) {
        x = u8[b + 4] / 127.5 - 1; y = u8[b + 5] / 127.5 - 1; z = u8[b + 6] / 127.5 - 1;
      } else {
        x = dv.getInt16(b + 8, true) / 32767; y = dv.getInt16(b + 10, true) / 32767; z = dv.getInt16(b + 12, true) / 32767;
      }
      nor[i * 3] = x; nor[i * 3 + 1] = y; nor[i * 3 + 2] = z;
    }
    o = tanStart + N * tes;
    q = scan(dv, o, o + 512, p => {
      const e2 = dv.getUint32(p, true), c2 = dv.getUint32(p + 4, true);
      return (e2 === 4 || e2 === 8) && c2 >= N && c2 % N === 0 && c2 / N <= 8;
    });
    if (q < 0) {
      const w = [];
      for (let i = 0; i < 6; i++) w.push(dv.getUint32(o + i * 4, true));
      throw new Error('UV buffer not found (uv sets ' + nuv + ', tangent size ' + tes + ', next ' + w.join(',') + ')');
    }
    const ues = dv.getUint32(q, true);
    const sets = dv.getUint32(q + 4, true) / N;
    const stride = ues * sets;
    const uv = new Float32Array(N * 2);
    o = q + 8;
    for (let i = 0; i < N; i++) {
      const b = o + i * stride;
      if (ues === 8) { uv[i * 2] = dv.getFloat32(b, true); uv[i * 2 + 1] = dv.getFloat32(b + 4, true); }
      else { uv[i * 2] = half(dv.getUint16(b, true)); uv[i * 2 + 1] = half(dv.getUint16(b + 2, true)); }
    }
    let skin = null;
    try { skin = readSkinWeights(dv, o + N * stride, N, secs, nb); } catch (e) { skin = null; }
    return { mats, secs, pos, nor, uv, idx, nVerts: N, bones, skin };
  }

  function weightsLookRight(dv, start, stride, N, infl, ib, wb) {
    let good = 0, tried = 0;
    const step = Math.max(1, Math.floor(N / 200));
    for (let v = 0; v < N; v += step) {
      const b = start + v * stride + infl * ib;
      let sum = 0;
      for (let k = 0; k < infl; k++) sum += wb === 1 ? dv.getUint8(b + k) : dv.getUint16(b + k * 2, true);
      const full = wb === 1 ? 255 : 65535;
      if (Math.abs(sum - full) <= (wb === 1 ? 6 : 200)) good++;
      tried++;
    }
    return tried > 0 && good / tried > 0.95;
  }

  function readSkinWeights(dv, from, N, secs, nb) {
    const layouts = { 8: [[4, 1, 1]], 12: [[4, 2, 1]], 16: [[8, 1, 1], [4, 2, 2]], 24: [[8, 2, 1]], 32: [[8, 2, 2]] };
    for (let q = from; q < from + 256; q++) {
      if (q + 8 > dv.byteLength) break;
      const e = dv.getUint32(q, true), c = dv.getUint32(q + 4, true);
      if (e === 0 || e > 64 || c === 0 || c % N !== 0) continue;
      const st = c / N;
      const opts = layouts[st];
      if (!opts) continue;
      for (const [infl, ib, wb] of opts) {
        const start = q + 8;
        if (!weightsLookRight(dv, start, st, N, infl, ib, wb)) continue;
        const gi = new Uint16Array(N * 4), gw = new Float32Array(N * 4);
        const full = wb === 1 ? 255 : 65535;
        for (const sc of secs) {
          const bm = new Uint16Array(sc.nbm);
          for (let i = 0; i < sc.nbm; i++) bm[i] = dv.getUint16(sc.bmStart + i * 2, true);
          for (let v = sc.bv; v < sc.bv + sc.nv; v++) {
            const b = start + v * st;
            const list = [];
            for (let k = 0; k < infl; k++) {
              const li = ib === 1 ? dv.getUint8(b + k) : dv.getUint16(b + k * 2, true);
              const w = wb === 1 ? dv.getUint8(b + infl * ib + k) : dv.getUint16(b + infl * ib + k * 2, true);
              if (w > 0) list.push([li < bm.length ? bm[li] : 0, w / full]);
            }
            list.sort((a, b2) => b2[1] - a[1]);
            let tot = 0;
            for (let k = 0; k < 4 && k < list.length; k++) tot += list[k][1];
            for (let k = 0; k < 4 && k < list.length; k++) { gi[v * 4 + k] = list[k][0]; gw[v * 4 + k] = list[k][1] / tot; }
            if (!list.length) gw[v * 4] = 1;
          }
        }
        return { idx: gi, w: gw };
      }
    }
    return null;
  }

  function half(h) {
    const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 31, f = h & 1023;
    if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
    if (e === 31) return f ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + f / 1024);
  }

  // UE is Z-up, left-handed, centimetres; the editor wants Y-up, right-handed.
  function toEditorSpace(mesh) {
    const N = mesh.nVerts, p = mesh.pos, n = mesh.nor, k = 0.01;
    let T = [0, -1, 0, 0, 0, 1, 1, 0, 0];
    for (let i = 0; i < N; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      p[i * 3] = -y * k; p[i * 3 + 1] = z * k; p[i * 3 + 2] = x * k;
      const nx = n[i * 3], ny = n[i * 3 + 1], nz = n[i * 3 + 2];
      n[i * 3] = -ny; n[i * 3 + 1] = nz; n[i * 3 + 2] = nx;
    }
    let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
    for (let i = 0; i < N; i++) {
      mnx = Math.min(mnx, p[i * 3]); mxx = Math.max(mxx, p[i * 3]);
      mnz = Math.min(mnz, p[i * 3 + 2]); mxz = Math.max(mxz, p[i * 3 + 2]);
    }
    if (mxz - mnz > (mxx - mnx) * 1.25) {
      for (let i = 0; i < N; i++) {
        const x = p[i * 3], z = p[i * 3 + 2];
        p[i * 3] = z; p[i * 3 + 2] = -x;
        const nx = n[i * 3], nz = n[i * 3 + 2];
        n[i * 3] = nz; n[i * 3 + 2] = -nx;
      }
      mesh.rotated = true;
      T = mul3([0, 0, 1, 0, 1, 0, -1, 0, 0], T);
    }
    mesh.T = T;
    bakeBones(mesh);
    const idx = mesh.idx;
    let agree = 0, total = 0;
    const step = Math.max(3, Math.floor(idx.length / 3 / 4000) * 3);
    for (let t = 0; t + 2 < idx.length; t += step) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
      const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const d = fx * (n[a * 3] + n[b * 3] + n[c * 3]) + fy * (n[a * 3 + 1] + n[b * 3 + 1] + n[c * 3 + 1]) + fz * (n[a * 3 + 2] + n[b * 3 + 2] + n[c * 3 + 2]);
      if (d > 0) agree++;
      total++;
    }
    if (agree < total / 2) {
      for (let t = 0; t + 2 < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
      mesh.flipped = true;
    }
    return mesh;
  }

  function mul3(a, b) {
    const o = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
    return o;
  }

  function quatMat(q, sc) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const l = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
    const X = x / l, Y = y / l, Z = z / l, W = w / l;
    const r = [
      1 - 2 * (Y * Y + Z * Z), 2 * (X * Y - Z * W), 2 * (X * Z + Y * W),
      2 * (X * Y + Z * W), 1 - 2 * (X * X + Z * Z), 2 * (Y * Z - X * W),
      2 * (X * Z - Y * W), 2 * (Y * Z + X * W), 1 - 2 * (X * X + Y * Y)
    ];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] *= sc[j];
    return r;
  }

  function bakeBones(mesh) {
    const bones = mesh.bones;
    if (!bones || !bones.length || !bones[0].q) { mesh.bones = null; return; }
    const T = mesh.T, Tt = [T[0], T[3], T[6], T[1], T[4], T[7], T[2], T[5], T[8]];
    const lin = new Array(bones.length), pos = new Array(bones.length);
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      const A = quatMat(b.q, b.s);
      const par = b.parent;
      if (par >= 0 && par < i) {
        const PA = lin[par], PT = pos[par];
        lin[i] = mul3(PA, A);
        pos[i] = [
          PA[0] * b.t[0] + PA[1] * b.t[1] + PA[2] * b.t[2] + PT[0],
          PA[3] * b.t[0] + PA[4] * b.t[1] + PA[5] * b.t[2] + PT[1],
          PA[6] * b.t[0] + PA[7] * b.t[1] + PA[8] * b.t[2] + PT[2]
        ];
      } else { lin[i] = A; pos[i] = b.t.slice(); }
    }
    mesh.boneWorld = bones.map((b, i) => {
      const L = mul3(mul3(T, lin[i]), Tt);
      const t = pos[i];
      const tx = (T[0] * t[0] + T[1] * t[1] + T[2] * t[2]) * 0.01;
      const ty = (T[3] * t[0] + T[4] * t[1] + T[5] * t[2]) * 0.01;
      const tz = (T[6] * t[0] + T[7] * t[1] + T[8] * t[2]) * 0.01;
      return [L[0], L[3], L[6], 0, L[1], L[4], L[7], 0, L[2], L[5], L[8], 0, tx, ty, tz, 1];
    });
  }

  // textures

  function rgb565(c, out, o) {
    out[o] = ((c >> 11) & 31) * 255 / 31 | 0;
    out[o + 1] = ((c >> 5) & 63) * 255 / 63 | 0;
    out[o + 2] = (c & 31) * 255 / 31 | 0;
  }

  function alphaPalette(a0, a1, pal) {
    pal[0] = a0;
    pal[1] = a1;
    if (a0 > a1) for (let i = 1; i < 7; i++) pal[1 + i] = ((7 - i) * a0 + i * a1) / 7 | 0;
    else { for (let i = 1; i < 5; i++) pal[1 + i] = ((5 - i) * a0 + i * a1) / 5 | 0; pal[6] = 0; pal[7] = 255; }
  }

  function alphaIndices(src, p, pal, out) {
    const b0 = src[p + 2] | (src[p + 3] << 8) | (src[p + 4] << 16);
    const b1 = src[p + 5] | (src[p + 6] << 8) | (src[p + 7] << 16);
    for (let i = 0; i < 8; i++) { out[i] = pal[(b0 >> (3 * i)) & 7]; out[8 + i] = pal[(b1 >> (3 * i)) & 7]; }
  }

  function decodeDXT(src, w, h, kind) {
    const out = new Uint8Array(w * h * 4);
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
    const bsz = kind === 1 ? 8 : 16;
    const alp = new Uint8Array(16), apal = new Uint8Array(8), pal = new Uint8Array(16);
    let p = 0;
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++, p += bsz) {
        let cp = p;
        if (kind === 5) {
          alphaPalette(src[p], src[p + 1], apal);
          alphaIndices(src, p, apal, alp);
          cp = p + 8;
        } else if (kind === 3) {
          for (let i = 0; i < 8; i++) { alp[i * 2] = (src[p + i] & 15) * 17; alp[i * 2 + 1] = (src[p + i] >> 4) * 17; }
          cp = p + 8;
        }
        const c0 = src[cp] | (src[cp + 1] << 8), c1 = src[cp + 2] | (src[cp + 3] << 8);
        rgb565(c0, pal, 0);
        rgb565(c1, pal, 4);
        if (c0 > c1 || kind !== 1) {
          for (let i = 0; i < 3; i++) { pal[8 + i] = (2 * pal[i] + pal[4 + i]) / 3 | 0; pal[12 + i] = (pal[i] + 2 * pal[4 + i]) / 3 | 0; }
        } else {
          for (let i = 0; i < 3; i++) { pal[8 + i] = (pal[i] + pal[4 + i]) >> 1; pal[12 + i] = 0; }
        }
        const bits = (src[cp + 4] | (src[cp + 5] << 8) | (src[cp + 6] << 16) | (src[cp + 7] << 24)) >>> 0;
        const cut = kind === 1 && c0 <= c1;
        for (let i = 0; i < 16; i++) {
          const sel = (bits >>> (i * 2)) & 3;
          const px = bx * 4 + (i & 3), py = by * 4 + (i >> 2);
          if (px >= w || py >= h) continue;
          const o = (py * w + px) * 4;
          out[o] = pal[sel * 4]; out[o + 1] = pal[sel * 4 + 1]; out[o + 2] = pal[sel * 4 + 2];
          out[o + 3] = kind === 1 ? ((cut && sel === 3) ? 0 : 255) : alp[i];
        }
      }
    }
    return out;
  }

  function decodeBC4Block(src, p, vals, pal) {
    alphaPalette(src[p], src[p + 1], pal);
    alphaIndices(src, p, pal, vals);
  }

  function decodeBC45(src, w, h, two) {
    const out = new Uint8Array(w * h * 4);
    const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
    const r = new Uint8Array(16), g = new Uint8Array(16), pal = new Uint8Array(8);
    let p = 0;
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        decodeBC4Block(src, p, r, pal); p += 8;
        if (two) { decodeBC4Block(src, p, g, pal); p += 8; }
        for (let i = 0; i < 16; i++) {
          const px = bx * 4 + (i & 3), py = by * 4 + (i >> 2);
          if (px >= w || py >= h) continue;
          const o = (py * w + px) * 4;
          if (two) {
            const x = r[i] / 127.5 - 1, y = g[i] / 127.5 - 1;
            const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
            out[o] = r[i]; out[o + 1] = g[i]; out[o + 2] = (z * 0.5 + 0.5) * 255;
          } else { out[o] = out[o + 1] = out[o + 2] = r[i]; }
          out[o + 3] = 255;
        }
      }
    }
    return out;
  }

  function findPixelFormat(u8) {
    for (let i = 8; i < u8.length - 8; i++) {
      if (u8[i] === 0x50 && u8[i + 1] === 0x46 && u8[i + 2] === 0x5F) {
        const len = u8[i - 4] | (u8[i - 3] << 8);
        if (len > 4 && len < 24 && u8[i - 2] === 0 && u8[i - 1] === 0 && u8[i + len - 1] === 0) return i - 4;
      }
    }
    return -1;
  }

  async function decodeTexture(pak, base) {
    const pkg = await loadPackage(pak, base);
    if (!pkg) return null;
    const ubulkE = findFile(pak, base + '.ubulk');
    const ubulk = ubulkE ? await readEntry(pak, ubulkE) : null;
    const u8 = pkg.uexp;
    const at = findPixelFormat(u8);
    if (at < 0) throw new Error('Texture layout not recognised');
    const r = new Rd(u8, at - 12);
    const sx = r.i32(), sy = r.i32();
    r.i32();
    const fmt = r.fstr();
    const mips = [];
    r.i32();
    const nm = r.i32();
    if (nm < 1 || nm > 20) throw new Error('Texture layout not recognised');
    for (let i = 0; i < nm; i++) {
      r.i32();
      const flags = r.u32();
      const count = r.i32();
      r.i32();
      const off = r.u64();
      let data = null;
      if (flags & 0x100) {
        if (ubulk && off + count <= ubulk.length) data = ubulk.subarray(off, off + count);
      } else if (!(flags & 0x20)) {
        data = r.bytes(count);
      }
      const mx = r.i32(), my = r.i32();
      r.i32();
      mips.push({ w: mx, h: my, data });
    }
    let pick = mips.find(m => m.data && m.w <= 2048 && m.h <= 2048) || mips.find(m => m.data);
    if (!pick) throw new Error('Texture has no readable data');
    const w = pick.w, h = pick.h, d = pick.data;
    let rgba;
    switch (fmt) {
      case 'PF_DXT1': rgba = decodeDXT(d, w, h, 1); break;
      case 'PF_DXT3': rgba = decodeDXT(d, w, h, 3); break;
      case 'PF_DXT5': rgba = decodeDXT(d, w, h, 5); break;
      case 'PF_BC5': rgba = decodeBC45(d, w, h, true); break;
      case 'PF_G8': case 'PF_BC4': rgba = fmt === 'PF_G8' ? gray8(d, w, h) : decodeBC45(d, w, h, false); break;
      case 'PF_B8G8R8A8': rgba = bgra(d, w, h); break;
      default: throw new Error('Unsupported texture format ' + fmt);
    }
    let mask = false;
    if (fmt === 'PF_DXT3' || fmt === 'PF_DXT5' || fmt === 'PF_B8G8R8A8') {
      let lo = 0, hi = 0, tot = 0;
      for (let i = 3; i < rgba.length; i += 28) {
        const a = rgba[i];
        if (a < 16) lo++; else if (a > 240) hi++;
        tot++;
      }
      mask = tot > 0 && (lo + hi) / tot > 0.85 && lo / tot > 0.02 && hi / tot > 0.02;
    }
    return { w, h, rgba, format: fmt, sx, sy, mask };
  }

  function gray8(d, w, h) {
    const o = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = d[i]; o[i * 4 + 3] = 255; }
    return o;
  }

  function bgra(d, w, h) {
    const o = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) { o[i * 4] = d[i * 4 + 2]; o[i * 4 + 1] = d[i * 4 + 1]; o[i * 4 + 2] = d[i * 4]; o[i * 4 + 3] = d[i * 4 + 3]; }
    return o;
  }

  function importPackage(pk, ref) {
    const im = pk.imports[-ref - 1];
    if (!im) return null;
    const outer = pk.imports[-im.outer - 1];
    return outer ? { cls: im.cls, pkg: outer.name } : null;
  }

  const COLOR_NAME = /base.?colou?r|diffuse|albedo|^color$|maintex|basetex|^tex$/i;

  async function materialTexture(pak, matPkgPath) {
    const base = findAsset(pak, matPkgPath, '.uasset');
    if (!base) return null;
    const rel = base.path.replace(/\.uasset$/i, '');
    const pkg = await loadPackage(pak, rel);
    if (!pkg) return null;
    const exp = pkg.pk.exports.find(e => /Material/.test(e.cls) && !/^Default__/.test(e.name));
    if (!exp) return null;
    const rd = exportReader(null, pkg.uexp, pkg.pk, exp);
    const props = readProps(rd, pkg.pk.names);
    const list = props.TextureParameterValues || [];
    const picked = [];
    for (const t of list) {
      const nm = t.ParameterInfo && t.ParameterInfo.Name;
      const ref = t.ParameterValue;
      if (typeof ref !== 'number' || ref >= 0) continue;
      const imp = importPackage(pkg.pk, ref);
      if (!imp || /placeholder/i.test(imp.pkg)) continue;
      picked.push({ name: nm || '', pkg: imp.pkg });
    }
    const best = picked.find(x => COLOR_NAME.test(x.name)) || picked[0];
    return best ? best.pkg : null;
  }

  function cullStray(mesh) {
    const p = mesh.pos, secs = mesh.secs;
    const box = secs.map(sc => {
      const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
      for (let v = sc.bv; v < sc.bv + sc.nv; v++) {
        for (let k = 0; k < 3; k++) {
          const x = p[v * 3 + k];
          if (x < b[k]) b[k] = x;
          if (x > b[k + 3]) b[k + 3] = x;
        }
      }
      return b;
    });
    const order = secs.map((_, i) => i).sort((a, b) => secs[b].nv - secs[a].nv);
    const total = secs.reduce((a, sc) => a + sc.nv, 0);
    const body = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    let acc = 0;
    for (const i of order) {
      for (let k = 0; k < 3; k++) { body[k] = Math.min(body[k], box[i][k]); body[k + 3] = Math.max(body[k + 3], box[i][k + 3]); }
      acc += secs[i].nv;
      if (acc >= total * 0.8) break;
    }
    const pad = Math.max(body[4] - body[1], 0.01) * 0.3;
    const keep = [];
    secs.forEach((sc, i) => {
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const c = (box[i][k] + box[i][k + 3]) / 2;
        if (c < body[k] - pad || c > body[k + 3] + pad) ok = false;
      }
      if (ok) keep.push(sc);
    });
    mesh.dropped = secs.length - keep.length;
    if (keep.length) mesh.secs = keep;
  }

  async function loadSkinMesh(pak, meshBase, onStatus) {
    const say = onStatus || (() => {});
    const pkg = await loadPackage(pak, meshBase);
    if (!pkg) throw new Error('Mesh asset not found in pak');
    say('mesh');
    const mesh = parseSkeletalMesh(pkg.uexp, pkg.pk);
    toEditorSpace(mesh);
    cullStray(mesh);

    const texCache = new Map();
    const matTex = [];
    const warn = [];
    for (let i = 0; i < mesh.mats.length; i++) {
      matTex.push(null);
      const imp = importPackage(pkg.pk, mesh.mats[i].ref);
      if (!imp) continue;
      say('material ' + (i + 1) + '/' + mesh.mats.length);
      try {
        const texPkg = await materialTexture(pak, imp.pkg);
        if (!texPkg) continue;
        if (!texCache.has(texPkg)) {
          const file = findAsset(pak, texPkg, '.uasset');
          let tex = null;
          if (file) {
            try { tex = await decodeTexture(pak, file.path.replace(/\.uasset$/i, '')); }
            catch (e) { warn.push(texPkg.split('/').pop() + ': ' + e.message); }
          }
          texCache.set(texPkg, tex);
        }
        matTex[i] = texCache.get(texPkg);
      } catch (e) {
        warn.push(imp.pkg.split('/').pop() + ': ' + e.message);
      }
    }
    return { mesh, matTex, warn };
  }

  function canvasFromTexture(t) {
    const c = document.createElement('canvas');
    c.width = t.w; c.height = t.h;
    const x = c.getContext('2d');
    const id = x.createImageData(t.w, t.h);
    id.data.set(t.rgba);
    x.putImageData(id, 0, 0);
    return c;
  }

  function buildThree(result) {
    const m = result.mesh;
    const rigged = !!(m.skin && m.bones && m.boneWorld);
    const posA = new THREE.BufferAttribute(m.pos, 3);
    const norA = new THREE.BufferAttribute(m.nor, 3);
    const uvA = new THREE.BufferAttribute(m.uv, 2);
    const skiA = rigged ? new THREE.Uint16BufferAttribute(m.skin.idx, 4) : null;
    const skwA = rigged ? new THREE.Float32BufferAttribute(m.skin.w, 4) : null;
    const texObjs = new Map();
    const matObjs = new Map();
    const maxAniso = (typeof renderer !== 'undefined' && renderer.capabilities) ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 4;
    const matFor = mi => {
      if (matObjs.has(mi)) return matObjs.get(mi);
      const t = result.matTex[mi];
      let map = null;
      if (t) {
        if (!texObjs.has(t)) {
          const tx = new THREE.CanvasTexture(canvasFromTexture(t));
          tx.flipY = false;
          tx.encoding = THREE.sRGBEncoding;
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.anisotropy = maxAniso;
          texObjs.set(t, tx);
        }
        map = texObjs.get(t);
      }
      const mat = new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0xcccccc, roughness: 0.78, metalness: 0, side: THREE.DoubleSide, skinning: rigged });
      if (t && t.mask) mat.alphaTest = 0.5;
      matObjs.set(mi, mat);
      return mat;
    };

    const g = new THREE.Group();
    let skeleton = null, bones = null;
    if (rigged) {
      bones = m.bones.map(b => { const o = new THREE.Bone(); o.name = b.name; return o; });
      const worlds = m.boneWorld.map(a => new THREE.Matrix4().fromArray(a));
      m.bones.forEach((b, i) => {
        let local = worlds[i];
        if (b.parent >= 0 && b.parent < i) local = worlds[b.parent].clone().invert().multiply(worlds[i]);
        local.decompose(bones[i].position, bones[i].quaternion, bones[i].scale);
        if (b.parent >= 0 && b.parent < i) bones[b.parent].add(bones[i]); else g.add(bones[i]);
      });
      g.updateMatrixWorld(true);
      skeleton = new THREE.Skeleton(bones);
    }

    m.secs.forEach((s, i) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', posA);
      geo.setAttribute('normal', norA);
      geo.setAttribute('uv', uvA);
      if (rigged) { geo.setAttribute('skinIndex', skiA); geo.setAttribute('skinWeight', skwA); }
      geo.setIndex(new THREE.BufferAttribute(m.idx.slice(s.base, s.base + s.ntri * 3), 1));
      let mesh;
      if (rigged) {
        mesh = new THREE.SkinnedMesh(geo, matFor(s.mat));
        mesh.frustumCulled = false;
        g.add(mesh);
        mesh.bind(skeleton, new THREE.Matrix4());
      } else {
        mesh = new THREE.Mesh(geo, matFor(s.mat));
        g.add(mesh);
      }
      mesh.name = (m.mats[s.mat] && m.mats[s.mat].slot) || ('section_' + i);
    });
    g.userData.bones = bones;
    g.userData.rigged = rigged;
    return g;
  }

  root.UEPak = { Src, openPak, listSkeletalMeshes, loadSkinMesh, buildThree, decodeTexture, readEntry, parsePackage, parseSkeletalMesh, loadPackage };
  if (typeof module !== 'undefined') module.exports = root.UEPak;
})(typeof window !== 'undefined' ? window : globalThis);
