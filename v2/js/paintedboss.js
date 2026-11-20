import * as T from 'three';

let pending;
function loadModelAssets() {
const directory = new URL('../assets/diorama/skin3d/',import.meta.url).href;
const loader = new T.TextureLoader();
return Promise.all([
  fetch(directory+'boss-rig.json').then(r=>r.json()),
  loader.loadAsync(directory+'boss-wrap.webp'),
  loader.loadAsync(directory+'boss-turnaround.png')
]).then(([parts,wrap,original])=>{
for (const texture of [wrap,original]) {
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = Math.min(8,4);
}

return {parts,wrap,original};
});
}

export async function buildPaintedBoss(){
  pending ||= loadModelAssets().catch(error=>{pending=null;throw error});
  const {parts,wrap,original}=await pending;
// All joints and cross-sections share the two drawings' rest coordinate frame.
function world(x,y,profile) {
  return new T.Vector3((x-320)/500,(1003-y)/500,(800-profile)/500);
}
const bones=[], joints={}, rest={};
function joint(name,parent,x,y,profile) {
  const bone=new T.Bone();
  bone.name=name;
  bone.userData.level=y;
  rest[name]=world(x,y,profile);
  bone.position.copy(rest[name]);
  if(parent) {
    bone.position.sub(rest[parent]);
    joints[parent].add(bone);
  }
  joints[name]=bone;
  bones.push(bone);
}
joint('pelvis',null,319,477,796);
joint('chest','pelvis',318,385,797);
joint('head','chest',318,186,801);
for(const tag of ['R','L']) {
  const r=tag==='R';
  joint('upper'+tag,'chest',r?220:415,244,802);
  joint('elbow'+tag,'upper'+tag,r?172:466,r?358:413,r?731:810);
  joint('hand'+tag,'elbow'+tag,r?127:513,r?400:518,r?678:791);
  joint('thigh'+tag,'pelvis',r?257:381,494,800);
  joint('knee'+tag,'thigh'+tag,r?229:413,716,784);
  joint('foot'+tag,'knee'+tag,r?202:442,935,804);
}
joint('staff','handR',108,406,656);
joint('tail','pelvis',342,430,712);
joint('tip','tail',336,618,698);

const positions=[],uvs=[],indices=[],weights=[],boneIds=[];
const segments=64;
function vertex(point,u,v,chain,y) {
  positions.push(point.x,point.y,point.z);uvs.push(u,v);
  // Blend across a joint band rather than rotating separate rigid limb segments.
  let a=0,b=0,mix=0;
  for(let i=1;i<chain.length;i++) {
    const child=chain[i],pivot=joints[child].userData.level;
    const upwards = child==='chest' || child==='head';
    const radius=child.startsWith('foot')?25:child.startsWith('hand')?16:42;
    mix=T.MathUtils.smoothstep(y,pivot-radius,pivot+radius);
    if(upwards) mix=1-mix;
    a=i-1;b=i;
    if(mix<1) break;
  }
  boneIds.push(bones.indexOf(joints[chain[a]]),bones.indexOf(joints[chain[b]]),0,0);
  weights.push(1-mix,mix,0,0);
}
function buildSurface(part) {
  const rows=[],chain=part.chain.split(' ');
  for(let i=1;i<part.rows.length;i++){
    const from=part.rows[i-1],to=part.rows[i],steps=Math.ceil((to[0]-from[0])/7);
    for(let j=0;j<steps;j++) rows.push(from.map((v,k)=>T.MathUtils.lerp(v,to[k],j/steps)));
  }
  rows.push(part.rows.at(-1));
  const [u,v,width,height]=part.uv,texW=wrap.image.width,texH=wrap.image.height;
  const first=positions.length/3;
  rows.forEach(([y,left,right,near,far],row)=>{
    for(let i=0;i<=segments;i++) {
      const f=i/segments,angle=f*2*Math.PI,c=Math.cos(angle),s=Math.sin(angle);
      const x=(left+right)/2+s*(right-left)/2;
      let profile=(near+far)/2-c*(far-near)/2;
      if(part.name==='mask' && c>0) {
        // A narrow nasal ridge, cheek planes and chin instead of a cylindrical face.
        const bump=(cx,cy,wx,wy)=>Math.exp(-(((x-cx)/wx)**2 + ((y-cy)/wy)**2));
        profile-=c*(9*bump(320,117,11,18)+4*bump(290,125,13,16)+4*bump(346,125,13,16));
      }
      vertex(world(x,y,profile),(u+.5+f*(width-1))/texW,1-(v+.5+y-rows[0][0])/texH,chain,y);
      if(i<segments && row<rows.length-1){
        const a=first+row*(segments+1)+i,b=a+segments+1;
        indices.push(a,b,a+1,b,b+1,a+1);
      }
    }
  });
  for(const end of [0,rows.length-1]){
    const base=first+end*(segments+1);
    for(let i=1;i<segments-1;i++) {
      if(!end) indices.push(base,base+i,base+i+1);
      else indices.push(base,base+i+1,base+i);
    }
  }
}
parts.forEach(buildSurface);
const geometry=new T.BufferGeometry();
geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(boneIds,4));
geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
geometry.setIndex(indices);geometry.computeVertexNormals();
const body=new T.SkinnedMesh(geometry,new T.MeshStandardMaterial({map:wrap,roughness:1}));
body.add(joints.pelvis);body.bind(new T.Skeleton(bones));body.frustumCulled=false;

// Trace the tapered crescent from the painting. Give its rim thickness and a bevel.
const crescent=new T.Shape();
crescent.moveTo(94,-65);crescent.bezierCurveTo(30,-88,25,-178,105,-181);
crescent.bezierCurveTo(181,-177,181,-93,128,-65);
crescent.bezierCurveTo(165,-103,163,-152,111,-154);
crescent.bezierCurveTo(51,-158,48,-108,94,-65);
const blade=new T.ExtrudeGeometry(crescent,{depth:5,bevelSize:1.7,bevelThickness:1.5,bevelSegments:3,curveSegments:28});
const bladePos=blade.attributes.position;
for(let i=0;i<bladePos.count;i++){
  const x=bladePos.getX(i),y=-bladePos.getY(i),z=bladePos.getZ(i);
  blade.attributes.uv.setXY(i,x/1536,1-y/1024);
  const p=world(x,y,659-z).sub(rest.staff);
  bladePos.setXYZ(i,p.x,p.y,p.z);
}
blade.computeVertexNormals();
joints.staff.add(new T.Mesh(blade,new T.MeshStandardMaterial({map:original,roughness:.7})));

// The bell is suspended from a small loop rather than floating beside the pole.
const loop=new T.Mesh(new T.TorusGeometry(.024,.003,8,24),new T.MeshStandardMaterial({color:0x684938}));
loop.position.copy(world(96,221,649)).sub(rest.staff);
loop.rotation.z=-.48;joints.staff.add(loop);
const soleSamples = ['R','L'].flatMap(tag=>[714,830].map(profile=>({
  joint:joints['foot'+tag], offset:world(tag==='R'?189:448,1000,profile).sub(rest['foot'+tag])
})));
const samplePoint=new T.Vector3();
const modelWorld=new T.Quaternion(),staffWorld=new T.Quaternion(),tilt=new T.Quaternion(),axis=new T.Vector3(1,0,0);

let phase=0,amount=0,time=0;
const identity=new T.Quaternion(), delta=new T.Quaternion(),base=new T.Quaternion();
const euler=new T.Euler();
const combatBones={pelvis:'pelvis',chest:'chest',head:'head',upperR:'upperarmR',upperL:'upperarmL',elbowR:'forearmR',elbowL:'forearmL',handR:'handR',staff:'weapon',thighR:'thighR',thighL:'thighL',kneeR:'shinR',kneeL:'shinL'};
function update(dt,walking,rate=1,combat=null){
  amount=T.MathUtils.damp(amount,walking?1:0,6,dt);
  phase+=dt*4.6*rate;
  time+=dt;
  for(const bone of bones)bone.quaternion.identity();
  const beat=Math.sin(phase),breath=Math.sin(time*1.8);
  joints.pelvis.position.copy(rest.pelvis);
  joints.pelvis.position.x+=amount*.028*Math.cos(phase);
  joints.pelvis.position.y+=.002*breath-amount*.024*Math.sin(phase)**2;
  joints.pelvis.rotation.set(0,amount*.087*beat,amount*.025*Math.cos(phase));
  joints.chest.rotation.set(.012*breath,-.15*amount*beat,-.018*amount*Math.cos(phase));
  joints.head.rotation.y=.04*amount*beat;
  joints.tail.rotation.x=.08*amount*Math.sin(phase-.55);
  joints.tip.rotation.z=.08*amount*Math.cos(phase-.8);
  ['R','L'].forEach((tag,i)=>{
    const p=phase+i*Math.PI,stride=Math.sin(p),lift=Math.max(0,Math.cos(p));
    // The knee flexes on the return swing; the ankle counter-rotates in stance.
    joints['thigh'+tag].rotation.x=amount*(-.29*stride-.18*lift);
    joints['knee'+tag].rotation.x=amount*(.045+.58*lift**2);
    joints['foot'+tag].rotation.x=amount*(.25*stride-.22*lift);
    joints['upper'+tag].rotation.x=amount*(i?.22:.09)*stride;
    joints['elbow'+tag].rotation.x=-amount*(.035+.07*lift);
  });
  // Translate the pelvis to keep the lowest sole on the ground as knees flex.
  let lowest=Infinity;
  for(const sample of soleSamples){
    samplePoint.copy(sample.offset);
    lowest=Math.min(lowest,body.worldToLocal(sample.joint.localToWorld(samplePoint)).y);
  }
  joints.pelvis.position.y-=lowest;
  // Stabilise the long staff about the grip rather than exaggerating arm swing at its tip.
  joints.handR.getWorldQuaternion(staffWorld);
  joints.staff.quaternion.copy(staffWorld.invert()).multiply(body.getWorldQuaternion(modelWorld)).multiply(tilt.setFromAxisAngle(axis,-.025-.045*amount*beat));

  if(combat){
    for(const [target,source] of Object.entries(combatBones)){
      const rotation=combat.base[source] || [0,0,0];
      base.setFromEuler(euler.set(...rotation)).invert();
      delta.copy(combat.bones[source].quaternion).multiply(base);
      joints[target].quaternion.multiply(identity.identity().slerp(delta,combat.weight));
    }
  }
}
return {body,update,joints};
}
