import {buildPaintedBoss} from './paintedboss.js';
import * as T from 'three';

const canvas = document.querySelector('canvas');
const renderer = new T.WebGLRenderer({canvas, antialias:true});
const scene = new T.Scene();
scene.background = new T.Color(0xd6cdb9);
const camera = new T.OrthographicCamera(-1,1,1,-1,.05,20);
const {body,update,joints}=await buildPaintedBoss();
scene.add(body);
scene.add(new T.HemisphereLight(0xfff6e7,0xc3b9a4,2.05));
const key=new T.DirectionalLight(0xfff2da,1.15);key.position.set(-3,5,4);scene.add(key);
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
const ctx=shadowCanvas.getContext('2d'), gradient=ctx.createRadialGradient(64,64,2,64,64,64);
gradient.addColorStop(0,'rgba(45,35,24,.31)');gradient.addColorStop(1,'rgba(45,35,24,0)');
ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
const shadowMap=new T.CanvasTexture(shadowCanvas);
function contact(width,depth){
  const shadow=new T.Mesh(new T.PlaneGeometry(width,depth),new T.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;scene.add(shadow);return shadow;
}
const ground=contact(1.38,.84),feet=[contact(.29,.42),contact(.29,.42)];
ground.position.y=-.008;
let yaw=.19,walking=false,last=0;
const motion=document.querySelector('#motion');
motion.onclick=()=>{walking=!walking;motion.setAttribute('aria-pressed',String(walking))};
document.querySelectorAll('[data-y]').forEach(b=>b.onclick=()=>yaw=Number(b.dataset.y));
canvas.onpointerdown=e=>canvas.setPointerCapture(e.pointerId);
canvas.onpointermove=e=>{if(canvas.hasPointerCapture(e.pointerId))yaw-=e.movementX*.009};
function resize(){
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
  const aspect=canvas.clientWidth/canvas.clientHeight,half=Math.max(1.12,.66/aspect);
  camera.top=half;camera.bottom=-half;camera.left=-half*aspect;camera.right=half*aspect;camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);resize();
const footPoint=new T.Vector3();
renderer.setAnimationLoop(now=>{
  const dt=Math.min(.06,(now-last)/1000);last=now;
  update(dt,walking);
  ['R','L'].forEach((tag,i)=>{
    joints['foot'+tag].getWorldPosition(footPoint);
    feet[i].position.set(footPoint.x,-.003,footPoint.z+.045);
  });
  camera.position.set(4*Math.sin(yaw),1.26,4*Math.cos(yaw));camera.lookAt(0,.99,0);
  renderer.render(scene,camera);
});

