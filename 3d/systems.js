// Verpackungen in echten Maßen (cm): h = Höhe, d = Rückenbreite.
// Die Breite der Vorderseite ergibt sich aus dem Seitenverhältnis des Covers.
// pack: Verpackungsart (siehe packages.js), shell: Kunststofffarbe der Hülle.
// band: Kopfzeile des Rückens im Stil des Systems (ohne echte Logos).
export const SYSTEMS = {
  SNES: { name: 'Super Nintendo', h: 12.8, d: 3.4, pack: 'card', bg: '#c9c7cf', ink: '#1d1b25', band: { bg: '#2b2b38', ink: '#e8e6f0', text: 'SUPER NINTENDO', dots: ['#d62d2d', '#f2c11c', '#2d9b48', '#2c5fd4'] } },
  N64: { name: 'Nintendo 64', h: 13, d: 3.6, pack: 'card', bg: '#121214', ink: '#f3f3f3', band: { bg: '#121214', ink: '#f3f3f3', text: 'NINTENDO 64', dots: ['#d23a2b', '#2a6bd6', '#f3c623', '#20a052'] } },
  PS1: { name: 'PlayStation', h: 12.5, d: 1.0, pack: 'jewel', bg: '#0c0c0e', ink: '#f5f5f5', band: { bg: '#0c0c0e', ink: '#f5f5f5', text: 'PlayStation', dots: ['#e03d3d', '#f0c419', '#25a35a', '#2d73d8'] } },
  DC: { name: 'Dreamcast', h: 12.5, d: 1.2, pack: 'jewel', bg: '#f2f0ec', ink: '#222', band: { bg: '#f2f0ec', ink: '#333', text: 'Dreamcast', swirl: '#f07020' } },
  PS2: { name: 'PlayStation 2', h: 19, d: 1.4, pack: 'dvd', shell: '#0c0d11', bg: '#08090d', ink: '#fff', band: { bg: '#08090d', ink: '#9fb4ff', text: 'PlayStation 2', line: '#2e5fd1' } },
  X360: { name: 'Xbox 360', h: 19, d: 1.4, pack: 'dvd', shell: '#3f9a22', bg: null, ink: '#fff', band: { bg: '#5dc21e', ink: '#fff', text: 'XBOX 360' } },
  PS4: { name: 'PlayStation 4', h: 17, d: 1.1, pack: 'dvd', shell: '#123f98', bg: null, ink: '#fff', band: { bg: '#0b3b8f', ink: '#fff', text: 'PS4' } },
  PS5: { name: 'PlayStation 5', h: 17, d: 1.1, pack: 'dvd', shell: '#1a56c2', bg: null, ink: '#fff', band: { bg: '#f4f4f6', ink: '#111', text: 'PS5' } },
  PC: { name: 'PC', h: 23, d: 5, pack: 'card', bg: null, ink: '#fff', band: null },
};

export const ORDER = ['SNES', 'PS1', 'N64', 'DC', 'PS2', 'X360', 'PS4', 'PS5', 'PC'];

// Muss zu slug() in app.js und tools/fetch.mjs passen.
export const slug = (g) => `${g.system}-${g.title}`.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
