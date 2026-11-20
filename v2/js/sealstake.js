import * as THREE from 'three';
import {SPIRIT_GLYPH_PATHS} from './inkicons.js';

const wood = new THREE.MeshStandardMaterial({color:0x493530});
const brass = new THREE.MeshStandardMaterial({color:0xad8753,metalness:.3,roughness:.65});
const cord = new THREE.MeshStandardMaterial({color:0x923e34});
const pole = new THREE.CylinderGeometry(.10,.15,1.4,7);
const band = new THREE.CylinderGeometry(.15,.15,.075,8);
const hoop = new THREE.TorusGeometry(.18,.033,7,20);
const tag = new THREE.BoxGeometry(.52,.72,.045);
const papers = new Map();
export function sealPaper(shape){
  if(papers.has(shape)) return papers.get(shape);
  const c=document.createElement('canvas'); c.width=128; c.height=176;
  const ctx=c.getContext('2d');ctx.fillStyle='#dec9a1';ctx.fillRect(0,0,128,176);
  ctx.strokeStyle='#a55542';ctx.strokeRect(7,7,114,162);
  ctx.fillStyle='#993e33';ctx.fillRect(55,137,18,18);
  ctx.lineWidth=7;ctx.lineJoin=ctx.lineCap='round';ctx.strokeStyle='#302524';
  for(const path of SPIRIT_GLYPH_PATHS[shape] || SPIRIT_GLYPH_PATHS.tri){
    ctx.beginPath();path.forEach(([x,y],i)=>ctx[i?'lineTo':'moveTo'](64+x*46,79+y*46));ctx.stroke();
  }
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
  const mat=new THREE.MeshBasicMaterial({map});papers.set(shape,mat);return mat;
}
export function buildSealStake(shape='tri'){
  const g=new THREE.Group();
  function piece(geo,mat,y,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(0,y,z);g.add(m);return m;}
  piece(pole,wood,.70);piece(band,brass,.16);piece(band,cord,1.28);piece(hoop,brass,1.56);
  const paper=piece(tag,sealPaper(shape),.91,.14);paper.rotation.x=-.19;
  g.userData.paper=paper;g.rotation.y=.42;return g;
}
