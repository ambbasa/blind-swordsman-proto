const sheet = new Image();
sheet.src = new URL('../../assets/v2/loot-bamboo.webp', import.meta.url).href;
const kinds = ['xp','coin','heal','dashplus','ice','fire','poison','bell','herb','magnet','bang','charm'];
const tile = 192;

export function paintDrop(texture, kind) {
  const index = kinds.indexOf(kind);
  if (index < 0) return;
  function paint() {
    const canvas = texture.image, ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sheet, index % 4 * tile, Math.floor(index / 4) * tile, tile, tile, 0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
  }
  if (sheet.naturalWidth) paint();
  else sheet.addEventListener('load', paint, { once: true });
}

export function paintBamboo(ctx, variant, x, y, width, height) {
  if (sheet.naturalWidth) ctx.drawImage(sheet, variant * tile, tile * 3, tile, tile, x-width/2, y-height/2, width, height);
}

const skillSheet = new Image();
skillSheet.src = new URL('../../assets/v2/skill-brush.webp', import.meta.url).href;
const skills = ['ward','inkstep','bolt','echo','reson','counter','ice','fire','poison'];
export function paintSkill(ctx, kind, x, y, width, height) {
  const cell = skills.indexOf(kind);
  if (cell < 0 || !skillSheet.naturalWidth) return;
  ctx.drawImage(skillSheet, cell % 3 * 256, Math.floor(cell / 3) * 256, 256, 256,
    x - width / 2, y - height / 2, width, height);
}
