import * as THREE from 'three';
const sheets = {};
for (const [key, file, cols, rows] of [
  ['terrain','terrain-signs',3,3], ['phases','skill-phases',4,3],
  ['loot','loot-bamboo',4,4], ['skill','skill-brush',3,3]
]) {
  const image = new Image();
  image.src = new URL('../../assets/v2/' + file + '.webp',import.meta.url).href;
  sheets[key] = {image,cols,rows};
}
// Feathered lobes overlap without the hard border of a floor illustration.
const mist = document.createElement('canvas');
mist.width = mist.height = 96;
const brush = mist.getContext('2d');
for (const [x,y,r] of [[41,43,39],[61,54,29],[36,61,26]]) {
  const wash = brush.createRadialGradient(x,y,0,x,y,r);
  wash.addColorStop(0,'rgba(206,164,224,.47)');
  wash.addColorStop(.55,'rgba(163,112,187,.27)');
  wash.addColorStop(1,'rgba(147,104,174,0)');
  brush.fillStyle = wash;
  brush.fillRect(0,0,96,96);
}
sheets.mist = {image:mist,cols:1,rows:1};
export function paintFrame(ctx,key,index,x,y,width,height) {
  const {image,cols,rows} = sheets[key];
  if (!image.naturalWidth) return;
  const w=image.naturalWidth/cols,h=image.naturalHeight/rows;
  ctx.drawImage(image,index%cols*w,Math.floor(index/cols)*h,w,h,x-width/2,y-height,width,height);
}
// A transparent batch per atlas cell. Render behind transparent actors; opaque
// meshes occlude the decal through the depth buffer, including at their feet.
const geometry=new THREE.PlaneGeometry(1,1);
geometry.rotateX(-Math.PI/2);
export function makeGroundLayer(scene) {
  const batches=new Map(), transform=new THREE.Object3D();
  function put(key,index,x,z,width,height,angle=0,elevation=.065) {
    const {image,cols,rows}=sheets[key]; if(!(image.naturalWidth ?? image.width))return;
    const id=key+index;
    let mesh=batches.get(id);
    if(!mesh){
      let source=image;
      // Extract coverage from the dark ink, not the pale paper in the atlas.
      const footprint=key==='phases' && index>=8 && index<12;
      if(footprint){
        source=document.createElement('canvas');
        source.width=Math.floor(image.naturalWidth/cols);
        source.height=Math.floor(image.naturalHeight/rows);
        const ctx=source.getContext('2d');
        ctx.drawImage(image,index%cols*image.naturalWidth/cols,Math.floor(index/cols)*image.naturalHeight/rows,
          image.naturalWidth/cols,image.naturalHeight/rows,0,0,source.width,source.height);
        const pixels=ctx.getImageData(0,0,source.width,source.height);
        const data=pixels.data;
        for(let i=0;i<data.length;i+=4){
          const light=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];
          data[i+3]*=Math.min(1,Math.max(0,(190-light)/145));
          data[i]=32; data[i+1]=28; data[i+2]=33;
        }
        ctx.putImageData(pixels,0,0);
      }
      const map=new THREE.Texture(source);
      map.colorSpace=THREE.SRGBColorSpace;map.repeat.set(1/cols,1/rows);
      map.offset.set(index%cols/cols,1-(Math.floor(index/cols)+1)/rows);
      if(footprint){map.repeat.set(1,1);map.offset.set(0,0);}
      map.needsUpdate=true;
      const material=new THREE.MeshBasicMaterial({map,transparent:true,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
      mesh=new THREE.InstancedMesh(geometry,material,key === 'mist' ? 768 : 128);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;
      mesh.name='ground-decal:'+id;mesh.renderOrder=-1;scene.add(mesh);batches.set(id,mesh);
    }
    if(mesh.count===mesh.instanceMatrix.count)return;
    transform.position.set(x,elevation,z);transform.rotation.y=-angle;transform.scale.set(width,1,height);
    transform.updateMatrix();mesh.setMatrixAt(mesh.count++,transform.matrix);
  }
  return {put,begin(){for(const mesh of batches.values())mesh.count=0;},
    end(){for(const mesh of batches.values()){mesh.visible=mesh.count>0;if(mesh.visible)mesh.instanceMatrix.needsUpdate=true;}}};
}
