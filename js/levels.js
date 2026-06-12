/* Super Nico World — level definitions.
   Levels are built programmatically so every gap and platform height is
   guaranteed jumpable: gaps ≤ 4 tiles (run jump ≈ 6), climbs ≤ 3 tiles
   (jump height ≈ 3.75 tiles).

   Legend:
     #  ground          X  solid stone     B  brick
     ?  question (coin) M  question (mushroom)
     Y  question (dino egg — rideable flying dino!)
     C  floating coin   =  wooden platform (one-way)
     T  pipe top        |  pipe body       ^  spikes (solid, hurt on top)
     F  flagpole        g  goomba          k  koopa     S  player start
*/

const LevelBuilder = (() => {
  const H = 12; // rows; ground occupies rows 10-11

  function grid(w) { return Array.from({ length: H }, () => Array(w).fill(' ')); }
  function put(g, x, y, s) { for (let i = 0; i < s.length; i++) if (s[i] !== ' ') g[y][x + i] = s[i]; }
  function vput(g, x, y0, y1, c) { for (let y = y0; y <= y1; y++) g[y][x] = c; }
  function ground(g, x0, x1) { for (let x = x0; x <= x1; x++) { g[10][x] = '#'; g[11][x] = '#'; } }
  function gap(g, x0, x1) { for (let x = x0; x <= x1; x++) { g[10][x] = ' '; g[11][x] = ' '; } }
  function spikes(g, x0, x1) { for (let x = x0; x <= x1; x++) g[10][x] = '^'; } // keeps '#' below at row 11
  function pipe(g, x, topY) { g[topY][x] = 'T'; for (let y = topY + 1; y <= 9; y++) g[y][x] = '|'; }
  function plat(g, x0, x1, y) { for (let x = x0; x <= x1; x++) g[y][x] = '='; }
  function coins(g, x0, x1, y) { for (let x = x0; x <= x1; x++) g[y][x] = 'C'; }
  function flag(g, x) { vput(g, x, 2, 9, 'F'); }
  function rows(g) { return g.map(r => r.join('')); }

  return { grid, put, vput, ground, gap, spikes, pipe, plat, coins, flag, rows };
})();

const LEVELS = (() => {
  const { grid, put, vput, ground, gap, spikes, pipe, plat, coins, flag, rows } = LevelBuilder;

  /* ---------- World 1: Green Hills ---------- */
  const g1 = grid(118);
  ground(g1, 0, 117);
  put(g1, 3, 9, 'S');
  coins(g1, 10, 12, 8);
  put(g1, 15, 6, 'B?B');
  put(g1, 20, 9, 'g');
  pipe(g1, 26, 8);
  gap(g1, 30, 32);                       // 3-tile gap
  plat(g1, 34, 38, 7);
  coins(g1, 35, 37, 5);
  put(g1, 43, 6, 'BYB');                 // dino egg block!
  put(g1, 50, 9, 'g'); put(g1, 53, 9, 'g'); put(g1, 57, 9, 'k');
  put(g1, 60, 6, 'B?BM?B');
  coins(g1, 61, 64, 4);
  pipe(g1, 66, 8);
  gap(g1, 70, 72);                       // 3-tile gap
  plat(g1, 76, 80, 7);
  coins(g1, 77, 79, 5);
  put(g1, 84, 9, 'g'); put(g1, 88, 9, 'g'); put(g1, 91, 9, 'k');
  gap(g1, 96, 98);                       // 3-tile gap
  vput(g1, 101, 9, 9, 'X');              // stair to finale
  vput(g1, 103, 8, 9, 'X');
  vput(g1, 105, 7, 9, 'X');
  flag(g1, 110);

  /* ---------- World 2: Cavern Climb ---------- */
  const g2 = grid(118);
  ground(g2, 0, 117);
  put(g2, 3, 9, 'S');
  plat(g2, 8, 10, 8);  coins(g2, 8, 10, 6);
  plat(g2, 13, 15, 6); put(g2, 13, 3, 'B?B');
  plat(g2, 18, 20, 8);
  put(g2, 23, 9, 'g');
  plat(g2, 27, 31, 7);                   // bridge over the spikes
  spikes(g2, 28, 30);
  put(g2, 34, 9, 'g');
  put(g2, 36, 6, 'M');
  gap(g2, 40, 42);                       // 3-tile gap
  vput(g2, 45, 8, 9, 'X'); vput(g2, 46, 8, 9, 'X'); vput(g2, 47, 8, 9, 'X');
  coins(g2, 45, 47, 6);
  put(g2, 52, 6, 'Y');                   // dino egg
  plat(g2, 57, 61, 7);                   // bridge over spikes
  spikes(g2, 58, 60);
  put(g2, 64, 9, 'k'); put(g2, 67, 9, 'g'); put(g2, 69, 9, 'g');
  put(g2, 66, 6, 'B?B');
  gap(g2, 74, 76);                       // 3-tile gap
  plat(g2, 78, 80, 8);
  plat(g2, 83, 85, 6); coins(g2, 83, 85, 4);
  plat(g2, 87, 91, 7);                   // bridge over spikes
  spikes(g2, 88, 90);
  put(g2, 95, 9, 'g'); put(g2, 99, 9, 'k');
  vput(g2, 102, 9, 9, 'X'); vput(g2, 104, 8, 9, 'X');
  flag(g2, 110);

  /* ---------- World 3: Sunset Fortress ---------- */
  const g3 = grid(120);
  ground(g3, 0, 119);
  put(g3, 3, 9, 'S');
  put(g3, 12, 6, 'B?B');
  put(g3, 16, 9, 'g');
  vput(g3, 20, 9, 9, 'X');               // stone pyramid up…
  vput(g3, 21, 8, 9, 'X');
  vput(g3, 22, 7, 9, 'X');
  vput(g3, 24, 8, 9, 'X');               // …and down
  vput(g3, 25, 9, 9, 'X');
  put(g3, 29, 9, 'k');
  gap(g3, 33, 35);                       // 3-tile gap
  pipe(g3, 38, 8);
  put(g3, 42, 6, 'BMB');
  put(g3, 46, 9, 'g'); put(g3, 49, 9, 'g'); put(g3, 52, 9, 'k');
  plat(g3, 55, 59, 7); coins(g3, 56, 58, 5);
  put(g3, 62, 6, 'Y');                   // dino egg
  gap(g3, 67, 69);                       // 3-tile gap (or just fly over it!)
  put(g3, 73, 6, 'B?B?B'); coins(g3, 74, 76, 4);
  vput(g3, 78, 9, 9, 'X');               // staircase over the fortress wall
  vput(g3, 79, 8, 9, 'X');
  vput(g3, 80, 7, 9, 'X');
  vput(g3, 82, 8, 9, 'X');
  vput(g3, 83, 9, 9, 'X');
  put(g3, 87, 9, 'k'); put(g3, 90, 9, 'g'); put(g3, 92, 9, 'g');
  gap(g3, 95, 97);                       // 3-tile gap
  plat(g3, 99, 101, 8);
  vput(g3, 104, 9, 9, 'X'); vput(g3, 106, 8, 9, 'X');
  flag(g3, 112);

  return [
    { name: 'Green Hills',     sky: ['#69b7e8', '#a8dcf5', '#e8f6dc'], birds: true,
      tint: null,                      rows: rows(g1) },
    { name: 'Cavern Climb',    sky: ['#1c2940', '#3d5a80', '#5b7ea3'], stars: true,
      tint: 'rgba(40,60,140,0.10)',    rows: rows(g2) },
    { name: 'Sunset Fortress', sky: ['#3b2a55', '#b6537a', '#f5a86e'], stars: true,
      tint: 'rgba(255,130,50,0.10)',   rows: rows(g3) },
  ];
})();
