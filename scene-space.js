import * as THREE from 'three';

export const miniatureBounds={minX:-18.68,maxX:18.68,minZ:-22.78,maxZ:10.69};
const softenedMaterials=new WeakSet();

// Clip the actual triangles, including interpolated UVs, before static batching.
export function clipLightToMiniature(mesh,bounds=miniatureBounds){
  mesh.updateWorldMatrix(true,false);
  const source=mesh.geometry,attrs=Object.entries(source.attributes),index=source.index;
  const output=Object.fromEntries(attrs.map(([name])=>[name,[]]));
  const inverse=mesh.matrixWorld.clone().invert();
  const planes=[['x',bounds.minX,1],['x',bounds.maxX,-1],['z',bounds.minZ,1],['z',bounds.maxZ,-1]];
  const count=index?index.count:source.attributes.position.count;
  for(let i=0;i<count;i+=3){
    let polygon=[];
    for(let j=0;j<3;j++){
      const id=index?index.getX(i+j):i+j,values={};
      for(const [name,attr] of attrs)values[name]=Array.from({length:attr.itemSize},(_,k)=>attr.array[id*attr.itemSize+k]);
      const world=new THREE.Vector3(...values.position).applyMatrix4(mesh.matrixWorld);
      polygon.push({world,values});
    }
    for(const [axis,limit,sign] of planes){
      const next=[];
      for(let j=0;j<polygon.length;j++){
        const a=polygon[j],b=polygon[(j+1)%polygon.length],da=(a.world[axis]-limit)*sign,db=(b.world[axis]-limit)*sign;
        if(da>=0)next.push(a);
        if((da>=0)!==(db>=0)){
          const t=da/(da-db),values={};
          for(const [name] of attrs)values[name]=a.values[name].map((v,k)=>v+(b.values[name][k]-v)*t);
          next.push({world:a.world.clone().lerp(b.world,t),values});
        }
      }
      polygon=next;if(!polygon.length)break;
    }
    for(let j=1;j+1<polygon.length;j++)for(const vertex of [polygon[0],polygon[j],polygon[j+1]]){
      for(const [name] of attrs)output[name].push(...(name==='position'?vertex.world.clone().applyMatrix4(inverse).toArray():vertex.values[name]));
    }
  }
  const clipped=new THREE.BufferGeometry();
  for(const [name,attr] of attrs)clipped.setAttribute(name,new THREE.Float32BufferAttribute(output[name],attr.itemSize));
  clipped.computeBoundingBox();clipped.computeBoundingSphere();mesh.geometry=clipped;source.dispose();
  if(!clipped.attributes.position.count)mesh.visible=false;
  const material=mesh.material;
  if(softenedMaterials.has(material))return;softenedMaterials.add(material);
  const declaration='varying vec3 vLightBoundaryPosition;\n';
  const fade=`smoothstep(0.0,0.65,min(min(vLightBoundaryPosition.x-(${bounds.minX.toFixed(3)}),${bounds.maxX.toFixed(3)}-vLightBoundaryPosition.x),min(vLightBoundaryPosition.z-(${bounds.minZ.toFixed(3)}),${bounds.maxZ.toFixed(3)}-vLightBoundaryPosition.z)))`;
  if(material.isShaderMaterial){
    material.vertexShader=declaration+material.vertexShader.replace('gl_Position=', 'vLightBoundaryPosition=(modelMatrix*vec4(position,1.)).xyz;gl_Position=');
    material.fragmentShader=declaration+material.fragmentShader.replace(/}\s*$/,`gl_FragColor.a *= ${fade};}`);
  }else{
    material.onBeforeCompile=shader=>{
      shader.vertexShader=declaration+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLightBoundaryPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
      shader.fragmentShader=declaration+shader.fragmentShader.replace('#include <alphamap_fragment>',`#include <alphamap_fragment>\ndiffuseColor.a *= ${fade};`);
    };
  }
  material.needsUpdate=true;
}

// Every flake owns one independent world position and a continuous fall phase.
// Camera position, direction and viewport never affect the simulation.
export function createSnowField(count){
  let seed=13757;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const origins=new Float32Array(count*3),motion=new Float32Array(count*3),sizes=new Float32Array(count),opacity=new Float32Array(count);
  for(let i=0;i<count;i++){
    origins.set([-18+random()*36,.18+random()*17.8,-22+random()*32],i*3);
    motion.set([.45+random()*.6,random()*Math.PI*2,.35+random()*.5],i*3);
    sizes[i]=.045+random()*.055;opacity[i]=.58+random()*.32;
  }
  return {count,origins,motion,sizes,opacity};
}
export function stepSnowField(field,time,positions){
  for(let i=0;i<field.count;i++){
    const k=i*3,phase=field.motion[k+1],speed=field.motion[k];
    positions[k]=field.origins[k]+Math.sin(time*.31+phase)*.42+Math.sin(time*.13+phase*2)*.17;
    positions[k+1]=.18+((field.origins[k+1]-.18-time*speed)%17.8+17.8)%17.8;
    positions[k+2]=field.origins[k+2]+Math.cos(time*.23+phase)*.25;
  }
}
