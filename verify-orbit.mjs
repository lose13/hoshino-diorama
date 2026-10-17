import assert from 'node:assert/strict';
import {IdleOrbitMotion,orbitSpeedMultiplier,ORBIT_CONFIG,orbitDirection} from './orbit-motion.js';
const pose={angle:0,polar:Math.PI/3,radius:20,x:10,y:1,z:5};
assert.equal(orbitSpeedMultiplier(0),1);
assert.equal(orbitSpeedMultiplier(Math.PI),1.5);
assert.ok(Math.abs(orbitSpeedMultiplier(Math.PI/2)-1.25)<1e-10);
for(let i=0;i<=360;i++){const k=orbitSpeedMultiplier(i*Math.PI/180);assert.ok(k>=1&&k<=1.5);}
const idle=new IdleOrbitMotion();idle.begin(0);assert.equal(idle.step(.1,10,pose,100),null);
idle.end(10);assert.equal(idle.step(.1,12.49,pose,100),null);
let result;for(let i=0;i<180;i++)result=idle.step(1/60,12.5+i/60,pose,100);
assert.ok(Math.abs(result.polar-68*Math.PI/180)<1e-12);assert.equal(result.radius,100);assert.equal(result.x,0);assert.ok(Math.abs(result.y-.6)<1e-12);assert.ok(Math.abs(result.z+6.2)<1e-12);
const direction=orbitDirection();assert.ok(Math.abs(Math.asin(direction.y)*180/Math.PI-22)<1e-12);assert.equal(ORBIT_CONFIG.preferredRadius,92);assert.ok(Math.abs(idle.baseSpeed*180/Math.PI-3.5)<1e-12);
// A new drag interrupts immediately. Resume samples the dragged pose, not the old route.
idle.begin(20);assert.equal(idle.step(.1,30,pose,100),null);idle.end(30);
const changed={...pose,angle:1.7,polar:1.1,x:-7};result=idle.step(0,32.5,changed,100);
assert.equal(result.angle,changed.angle);assert.equal(result.polar,changed.polar);assert.equal(result.x,changed.x);
idle.enabled=false;assert.equal(idle.step(.1,40,pose,100),null);
const blocked=new IdleOrbitMotion();assert.equal(blocked.step(.1,10,pose,100,true),null);
// One real-time route at different render rates must reach the same part of the orbit.
function run(fps){const orbit=new IdleOrbitMotion();for(let i=0;i<fps*100;i++)result=orbit.step(1/fps,i/fps,pose,100);return result.angle;}
assert.ok(Math.abs(run(30)-run(60))<.002);
console.log('PASS: 1×/1.25×/1.5× speed profile, reference 22° elevation and closer radius, faster 3.5°/s base speed, drag pause/resume, current-pose handoff, disabled/navigation ownership and frame-rate independence.');
