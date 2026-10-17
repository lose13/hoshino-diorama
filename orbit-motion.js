const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const ORBIT_CONFIG=Object.freeze({elevationDegrees:22,azimuthDegrees:22,preferredRadius:92,baseSpeedDegrees:3.5});
export function orbitDirection(azimuth=ORBIT_CONFIG.azimuthDegrees*Math.PI/180){const elevation=ORBIT_CONFIG.elevationDegrees*Math.PI/180;return {x:Math.sin(azimuth)*Math.cos(elevation),y:Math.sin(elevation),z:Math.cos(azimuth)*Math.cos(elevation)};}
export function orbitSpeedMultiplier(azimuth){return 1+.5*smooth((1-Math.cos(azimuth))*.5);}

// Camera handoff is sampled from the current pose, so interrupting never queues a flight.
export class IdleOrbitMotion{
  constructor(){this.enabled=true;this.active=false;this.interacting=false;this.holdUntil=0;this.elapsed=0;this.baseSpeed=ORBIT_CONFIG.baseSpeedDegrees*Math.PI/180;}
  pause(now,delay=2.5){this.active=false;this.holdUntil=now+delay;}
  begin(now){this.interacting=true;this.pause(now);}
  end(now){this.interacting=false;this.pause(now);}
  step(dt,now,pose,fitRadius,blocked=false){
    if(!this.enabled||this.interacting||blocked||now<this.holdUntil)return null;
    if(!this.active){this.active=true;this.elapsed=0;this.start={...pose};this.angle=pose.angle;this.radius=Math.max(pose.radius,fitRadius);}
    this.elapsed+=dt;
    const blend=smooth(this.elapsed/2),ramp=smooth(this.elapsed/1.5);
    this.angle+=this.baseSpeed*orbitSpeedMultiplier(this.angle)*ramp*dt;
    const radius=this.start.radius+(this.radius-this.start.radius)*blend;
    const targetPolar=(90-ORBIT_CONFIG.elevationDegrees)*Math.PI/180;
    const polar=this.start.polar+(targetPolar-this.start.polar)*blend;
    return {angle:this.angle,polar,radius,x:this.start.x*(1-blend),y:this.start.y+(.6-this.start.y)*blend,z:this.start.z+(-6.2-this.start.z)*blend,multiplier:orbitSpeedMultiplier(this.angle),blend};
  }
}
