import assert from 'node:assert/strict';
import * as THREE from 'three';
import {clipLightToMiniature,miniatureBounds,createSnowField,stepSnowField} from './scene-space.js';

// A window pool that crosses the east edge must retain only its receiving surface.
const pool=new THREE.Mesh(new THREE.PlaneGeometry(4,3),new THREE.MeshBasicMaterial());
pool.rotation.x=-Math.PI/2;pool.position.set(18.68,.4,-1);
clipLightToMiniature(pool);pool.updateMatrixWorld();
assert.equal(pool.geometry.attributes.position.count,9);
const p=new THREE.Vector3();
for(let i=0;i<pool.geometry.attributes.position.count;i++){
  p.fromBufferAttribute(pool.geometry.attributes.position,i).applyMatrix4(pool.matrixWorld);
  assert.ok(p.x<=miniatureBounds.maxX+1e-5);
  assert.ok(pool.geometry.attributes.uv.getX(i)<=.500001);
}
// Parent rotation and the north/east corner must also respect the same world bounds.
const parent=new THREE.Group(),corner=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshBasicMaterial());
parent.position.set(18,.4,-22);parent.rotation.y=.77;corner.rotation.x=-Math.PI/2;parent.add(corner);
clipLightToMiniature(corner);corner.updateWorldMatrix(true,false);
for(let i=0;i<corner.geometry.attributes.position.count;i++){
  p.fromBufferAttribute(corner.geometry.attributes.position,i).applyMatrix4(corner.matrixWorld);
  assert.ok(p.x<=miniatureBounds.maxX+1e-5&&p.z>=miniatureBounds.minZ-1e-5);
}
const outside=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial());outside.position.x=30;clipLightToMiniature(outside);assert.equal(outside.geometry.attributes.position.count,0);

const snow=createSnowField(900),positions=new Float32Array(2700);
for(const time of [0,.5,12,75,300,3600]){
  stepSnowField(snow,time,positions);
  assert.equal(new Set(Array.from({length:900},(_,i)=>positions[i*3+1].toFixed(5))).size>895,true);
  for(let i=0;i<900;i++)assert.ok(positions[i*3+1]>=.17999&&positions[i*3+1]<17.981);
}
// Changing the viewing matrix must not mutate the independent particle field.
stepSnowField(snow,15,positions);const before=positions.slice();
for(const angle of [0,.2,1.7,3.1]){
  const view=new THREE.Matrix4().makeRotationY(angle);
  for(let i=0;i<900;i++)p.fromArray(positions,i*3).applyMatrix4(view);
  const after=new Float32Array(2700);stepSnowField(snow,15,after);assert.deepEqual(after,before);
}
console.log('PASS: light geometry bounds, UV clipping, rotated receivers, empty clips, continuous snow phases and camera-independent world positions.');
