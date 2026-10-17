    const idleOrbitMotion=new IdleOrbitMotion(),orbitOffset=new THREE.Vector3(),orbitSavedPosition=new THREE.Vector3(),orbitSavedTarget=new THREE.Vector3();
    let orbitFitAspect=-1,orbitFitRadius=0,orbitWasOwner=false;
    const orbitButton=document.createElement('button');orbitButton.id='toggle-auto-orbit';orbitButton.className='fold-btn';orbitButton.textContent='⟳ 自动环绕 · 开';orbitButton.setAttribute('aria-pressed','true');orbitButton.title=`约${ORBIT_CONFIG.elevationDegrees}°俯视；正面${ORBIT_CONFIG.baseSpeedDegrees}°/秒，向侧面与背面平滑加快，最高${ORBIT_CONFIG.baseSpeedDegrees*1.5}°/秒；拖动时暂停`;
    document.getElementById('btn-home').after(orbitButton);
    function pauseIdleOrbit(delay=2.5){idleOrbitMotion.pause(performance.now()/1000,delay);orbitWasOwner=false;}
    orbitButton.addEventListener('click',()=>{idleOrbitMotion.enabled=!idleOrbitMotion.enabled;pauseIdleOrbit(0);orbitButton.textContent=idleOrbitMotion.enabled?'⟳ 自动环绕 · 开':'⟳ 自动环绕 · 关';orbitButton.setAttribute('aria-pressed',String(idleOrbitMotion.enabled));});
    controls.addEventListener('start',()=>{idleOrbitMotion.begin(performance.now()/1000);orbitWasOwner=false;});
    controls.addEventListener('end',()=>idleOrbitMotion.end(performance.now()/1000));
    renderer.domElement.addEventListener('pointercancel',()=>idleOrbitMotion.end(performance.now()/1000));
    window.addEventListener('blur',()=>idleOrbitMotion.end(performance.now()/1000));
    function fullOrbitRadius(){
      if(orbitFitAspect===camera.aspect)return orbitFitRadius;
      orbitFitAspect=camera.aspect;orbitFitRadius=0;
      for(let i=0;i<72;i++){const a=i*Math.PI/36,d=orbitDirection(a),direction=new THREE.Vector3(d.x,d.y,d.z);orbitFitRadius=Math.max(orbitFitRadius,fitOverview(direction).distanceTo(overviewCenter));}
      return orbitFitRadius;
    }
    function updateIdleOrbit(dt){
      const now=performance.now()/1000,blocked=!controls.enabled||gsap.isTweening(camera.position)||gsap.isTweening(controls.target);
      orbitOffset.copy(camera.position).sub(controls.target);
      const radius=orbitOffset.length(),pose={angle:Math.atan2(orbitOffset.x,orbitOffset.z),polar:Math.acos(THREE.MathUtils.clamp(orbitOffset.y/radius,-1,1)),radius,x:controls.target.x,y:controls.target.y,z:controls.target.z};
      const next=idleOrbitMotion.step(dt,now,pose,fullOrbitRadius(),blocked);
      if(!next){orbitWasOwner=false;orbitButton.dataset.mode=!idleOrbitMotion.enabled?'off':idleOrbitMotion.interacting?'dragging':'waiting';return false;}
      if(!orbitWasOwner){
        // Flush OrbitControls damping at the ownership boundary, restoring the visible pose.
        orbitSavedPosition.copy(camera.position);orbitSavedTarget.copy(controls.target);const damping=controls.enableDamping;controls.enableDamping=false;controls.update(0);controls.enableDamping=damping;camera.position.copy(orbitSavedPosition);controls.target.copy(orbitSavedTarget);
        currentCameraKey='iso';document.querySelectorAll('[data-cam]').forEach(b=>b.classList.toggle('active',b.dataset.cam==='iso'));syncStorySelection();closeDetail();
      }
      orbitWasOwner=true;controls.target.set(next.x,next.y,next.z);
      const horizontal=next.radius*Math.sin(next.polar);camera.position.set(next.x+horizontal*Math.sin(next.angle),next.y+next.radius*Math.cos(next.polar),next.z+horizontal*Math.cos(next.angle));camera.lookAt(controls.target);
      orbitButton.dataset.mode=next.blend<1?'returning':'rotating';orbitButton.dataset.pitch=String(90-next.polar*180/Math.PI);orbitButton.dataset.azimuth=String(next.angle*180/Math.PI);orbitButton.dataset.speedMultiplier=next.multiplier.toFixed(4);
      return true;
    }
