#!/usr/bin/env node
/* Builds a synthetic site model for testing the Site model tab. Not a real site.
   Writes to examples/site-model/:
     ground_model_volumes.obj   closed output volumes, one object per unit (as exported from Leapfrog)
     existing_ground.obj        topography surface
     emb_general_fill.dxf       top of general fill (road design surface), 3DFACE entities
     emb_working_platform.dxf   top of a 0.5 m working platform, polyface mesh
     groundwater.dxf            groundwater surface, 3DFACE entities
     alignment.geojson          embankment centreline, GDA2020 MGA zone 56
     pcs_zones.geojson          example PCS requirement zones (pcs_mm attribute)
     treatment_zones.geojson    example ground treatment zones
   Run: node tools/make-example-site.js */
"use strict";
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "examples", "site-model");
fs.mkdirSync(OUT, { recursive: true });

/* Alignment: 3 km, heading about 30° north of east, with a gentle S-curve. MGA zone 56 near 152.8°E, 27.5°S. */
const E0 = 480000, N0 = 6960000, L = 3000, TH = 30 * Math.PI / 180;
const dir = [Math.cos(TH), Math.sin(TH)], perp = [-Math.sin(TH), Math.cos(TH)];
const centre = ch => { const w = 90 * Math.sin(2 * Math.PI * ch / L); return [E0 + ch * dir[0] + w * perp[0], N0 + ch * dir[1] + w * perp[1]]; };
const tangent = ch => { const a = centre(ch - 0.5), b = centre(ch + 0.5), d = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
/* Along (u) and across (v) coordinates used to shape the geology. */
const uv = (E, N) => { const x = E - E0, y = N - N0; return [x * dir[0] + y * dir[1], x * perp[0] + y * perp[1]]; };

const topo = (u, v) => 8 + 1.6 * Math.sin(u / 380) + 0.004 * v - 3 * Math.exp(-(((u - 1700) / 140) ** 2));
const tSoft = (u, v) => Math.max(0, 9 * Math.exp(-(((u - 1700) / 520) ** 2)) + 0.8 * Math.sin(u / 230) + 0.004 * v - 1.0);
const tLens0 = (u, v) => Math.max(0, 1.4 * (1 - ((u - 1350) / 200) ** 2 - (v / 110) ** 2));
const tStiff = (u, v) => 3 + 1.5 * Math.cos(u / 500) + 0.002 * v;
const tDense = (u, v) => 4 + Math.sin(u / 300);
/* Stack of surfaces from the top down. The sand lens sits 40% of the way down the soft clay. */
function stack(E, N) {
  const [u, v] = uv(E, N), s0 = topo(u, v), ts = tSoft(u, v);
  let tl = tLens0(u, v); if (tl > ts - 1) tl = Math.max(0, Math.min(tl, ts - 1));
  const tu = (ts - tl) * 0.4, s1 = s0 - tu, s2 = s1 - tl, s3 = s2 - (ts - tu - tl), s4 = s3 - tStiff(u, v), s5 = s4 - tDense(u, v), s6 = s5 - 5;
  return [s0, s1, s2, s3, s4, s5, s6];
}

/* Rectangular model grid covering the alignment with a margin. */
const pts = Array.from({ length: 61 }, (_, i) => centre(i * L / 60));
const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), M = 150, G = 25;
const gx0 = Math.floor((Math.min(...xs) - M) / G) * G, gx1 = Math.ceil((Math.max(...xs) + M) / G) * G;
const gy0 = Math.floor((Math.min(...ys) - M) / G) * G, gy1 = Math.ceil((Math.max(...ys) + M) / G) * G;
const nx = (gx1 - gx0) / G + 1, ny = (gy1 - gy0) / G + 1;
const S = [];
for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) S.push(stack(gx0 + i * G, gy0 + j * G));
const at = (i, j, k) => S[j * nx + i][k];
const fx = v => v.toFixed(3);

/* A closed slab between surface kt (top) and kb (bottom), triangles facing outwards. */
function slab(o, kts, kbs) {
  const base = o.nv;
  const add = (x, y, z) => { o.v.push(`v ${fx(x)} ${fx(y)} ${fx(z)}`); return ++o.nv; };
  const T = [], B = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = gx0 + i * G, y = gy0 + j * G;
    T.push(add(x, y, at(i, j, kts))); B.push(add(x, y, at(i, j, kbs)));
  }
  const id = (A, i, j) => A[j * nx + i];
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
    const a = [i, j], b = [i + 1, j], c = [i + 1, j + 1], d = [i, j + 1];
    o.f.push(`f ${id(T, ...a)} ${id(T, ...b)} ${id(T, ...c)}`, `f ${id(T, ...a)} ${id(T, ...c)} ${id(T, ...d)}`); // up
    o.f.push(`f ${id(B, ...a)} ${id(B, ...c)} ${id(B, ...b)}`, `f ${id(B, ...a)} ${id(B, ...d)} ${id(B, ...c)}`); // down
  }
  /* Side walls, walking the boundary anticlockwise so the walls face out. */
  const ring = [];
  for (let i = 0; i < nx - 1; i++) ring.push([i, 0]);
  for (let j = 0; j < ny - 1; j++) ring.push([nx - 1, j]);
  for (let i = nx - 1; i > 0; i--) ring.push([i, ny - 1]);
  for (let j = ny - 1; j > 0; j--) ring.push([0, j]);
  for (let k = 0; k < ring.length; k++) {
    const p = ring[k], q = ring[(k + 1) % ring.length];
    const tp = id(T, ...p), tq = id(T, ...q), bp = id(B, ...p), bq = id(B, ...q);
    o.f.push(`f ${bp} ${bq} ${tq}`, `f ${bp} ${tq} ${tp}`);
  }
  return base;
}
{
  const o = { v: [], f: [], nv: 0 }, out = ["# Synthetic ground model for testing. Not a real site. GDA2020 MGA zone 56, AHD."];
  const vol = (name, pairs) => { const v0 = o.v.length, f0 = o.f.length; pairs.forEach(([a, b]) => slab(o, a, b)); out.push(`o ${name}`, ...o.v.slice(v0), ...o.f.slice(f0)); };
  vol("Alluvium - Soft clay", [[0, 1], [2, 3]]);
  vol("Alluvium - Sand lens", [[1, 2]]);
  vol("Stiff silty clay", [[3, 4]]);
  vol("Dense sand", [[4, 5]]);
  vol("Bedrock", [[5, 6]]);
  fs.writeFileSync(path.join(OUT, "ground_model_volumes.obj"), out.join("\n") + "\n");
}
{
  const out = ["# Existing ground (topography). Synthetic.", "o Topography"];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push(`v ${gx0 + i * G} ${gy0 + j * G} ${fx(at(i, j, 0))}`);
  const id = (i, j) => j * nx + i + 1;
  for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) out.push(`f ${id(i, j)} ${id(i + 1, j)} ${id(i + 1, j + 1)}`, `f ${id(i, j)} ${id(i + 1, j + 1)} ${id(i, j + 1)}`);
  fs.writeFileSync(path.join(OUT, "existing_ground.obj"), out.join("\n") + "\n");
}

/* Embankment: 30 m crest, 1V:2H batters, road level about 1–4.5 m above ground, highest on the approaches to the creek. */
const ground = (E, N) => { const [u, v] = uv(E, N); return topo(u, v); };
const roadAbove = ch => 1.4 + 0.4 * Math.sin(ch / 270) + 0.9 * Math.exp(-(((ch - 1700) / 260) ** 2));
const roadRL = ch => { const c = centre(ch); return ground(c[0], c[1]) * 0.7 + 8 * 0.3 + roadAbove(ch); };
const HALF = 15, CH = 15, offs = [];
for (let o = -32; o <= 32.001; o += 2) offs.push(+o.toFixed(2));
const embPts = [], NCH = L / CH + 1;
for (let k = 0; k < NCH; k++) {
  const ch = k * CH, c = centre(ch), t = tangent(ch), n = [-t[1], t[0]], z0 = roadRL(ch);
  embPts.push(offs.map(o => {
    const E = c[0] + o * n[0], N = c[1] + o * n[1], g = ground(E, N), a = Math.abs(o);
    const top = a <= HALF ? z0 - 0.02 * a : z0 - 0.02 * HALF - (a - HALF) / 2;
    const gf = Math.max(g, top), wp = Math.min(g + 0.5, gf);
    return { E, N, g, gf, wp };
  }));
}
function dxf3dface(file, layer, key) {
  const out = ["0", "SECTION", "2", "ENTITIES"];
  const P = (p, c) => [`1${c}`, fx(p.E), `2${c}`, fx(p.N), `3${c}`, fx(p[key])];
  for (let k = 0; k + 1 < embPts.length; k++) for (let m = 0; m + 1 < offs.length; m++) {
    const a = embPts[k][m], b = embPts[k + 1][m], c = embPts[k + 1][m + 1], d = embPts[k][m + 1];
    for (const [p, q, r] of [[a, b, c], [a, c, d]]) out.push("0", "3DFACE", "8", layer, ...P(p, 0), ...P(q, 1), ...P(r, 2), ...P(r, 3));
  }
  out.push("0", "ENDSEC", "0", "EOF");
  fs.writeFileSync(path.join(OUT, file), out.join("\n") + "\n");
}
function dxfPolyface(file, layer, key) {
  const nv = embPts.length * offs.length, faces = [];
  const id = (k, m) => k * offs.length + m + 1;
  for (let k = 0; k + 1 < embPts.length; k++) for (let m = 0; m + 1 < offs.length; m++) faces.push([id(k, m), id(k + 1, m), id(k + 1, m + 1)], [id(k, m), id(k + 1, m + 1), id(k, m + 1)]);
  const out = ["0", "SECTION", "2", "ENTITIES", "0", "POLYLINE", "8", layer, "66", "1", "10", "0", "20", "0", "30", "0", "70", "64", "71", String(nv), "72", String(faces.length)];
  embPts.forEach(row => row.forEach(p => out.push("0", "VERTEX", "8", layer, "10", fx(p.E), "20", fx(p.N), "30", fx(p[key]), "70", "192")));
  faces.forEach(f => out.push("0", "VERTEX", "8", layer, "10", "0", "20", "0", "30", "0", "70", "128", "71", String(f[0]), "72", String(f[1]), "73", String(f[2])));
  out.push("0", "SEQEND", "0", "ENDSEC", "0", "EOF");
  fs.writeFileSync(path.join(OUT, file), out.join("\n") + "\n");
}
dxf3dface("emb_general_fill.dxf", "GENERAL_FILL_TOP", "gf");
dxfPolyface("emb_working_platform.dxf", "WORKING_PLATFORM_TOP", "wp");

/* Groundwater: 0.4–2 m below ground, coarser grid. */
{
  const out = ["0", "SECTION", "2", "ENTITIES"], g2 = 50;
  const gw = (E, N) => { const [u, v] = uv(E, N); return topo(u, v) - (1.2 + 0.8 * Math.sin(u / 450) - 0.6 * Math.exp(-(((u - 1700) / 200) ** 2))); };
  const P = (E, N, c) => [`1${c}`, fx(E), `2${c}`, fx(N), `3${c}`, fx(gw(E, N))];
  for (let y = gy0; y < gy1; y += g2) for (let x = gx0; x < gx1; x += g2) {
    out.push("0", "3DFACE", "8", "GWL", ...P(x, y, 0), ...P(x + g2, y, 1), ...P(x + g2, y + g2, 2), ...P(x, y + g2, 3));
  }
  out.push("0", "ENDSEC", "0", "EOF");
  fs.writeFileSync(path.join(OUT, "groundwater.dxf"), out.join("\n") + "\n");
}

/* GIS layers, in MGA zone 56 with a crs so the app reads them as eastings and northings. */
const crs = { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::7856" } };
const r2 = p => [+p[0].toFixed(2), +p[1].toFixed(2)];
const line = Array.from({ length: 121 }, (_, i) => r2(centre(i * L / 120)));
fs.writeFileSync(path.join(OUT, "alignment.geojson"), JSON.stringify({ type: "FeatureCollection", crs, features: [{ type: "Feature", properties: { name: "Embankment centreline" }, geometry: { type: "LineString", coordinates: line } }] }));
const band = (c0, c1, w = 45) => {
  const left = [], right = [];
  for (let ch = c0; ch <= c1 + 1e-6; ch += 25) { const c = centre(ch), t = tangent(ch), n = [-t[1], t[0]]; left.push(r2([c[0] + w * n[0], c[1] + w * n[1]])); right.push(r2([c[0] - w * n[0], c[1] - w * n[1]])); }
  const ring = left.concat(right.reverse()); ring.push(ring[0]); return { type: "Polygon", coordinates: [ring] };
};
fs.writeFileSync(path.join(OUT, "pcs_zones.geojson"), JSON.stringify({ type: "FeatureCollection", crs, features: [
  { type: "Feature", properties: { name: "Road pavement", pcs_mm: 100 }, geometry: band(0, 1450) },
  { type: "Feature", properties: { name: "Bridge approach", pcs_mm: 50 }, geometry: band(1450, 1950) },
  { type: "Feature", properties: { name: "Road pavement", pcs_mm: 100 }, geometry: band(1950, 3000) },
] }));
fs.writeFileSync(path.join(OUT, "treatment_zones.geojson"), JSON.stringify({ type: "FeatureCollection", crs, features: [
  { type: "Feature", properties: { name: "Wick drains and surcharge" }, geometry: band(1250, 2150) },
  { type: "Feature", properties: { name: "Preload" }, geometry: band(800, 1250) },
] }));
for (const f of fs.readdirSync(OUT)) console.log(f.padEnd(28), (fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2), "MB");
