    // Rain and snow share one particle position buffer. Only the selected precipitation renders.
    let weatherMode='rain',snowActive=false,lastNonSnowSky='rainNight',lastPrecipitation='rain';
    const snowField=createSnowField(rainCount*2);let snowTime=0;
    rainGeo.setAttribute('flakeSize',new THREE.BufferAttribute(snowField.sizes,1));rainGeo.setAttribute('flakeOpacity',new THREE.BufferAttribute(snowField.opacity,1));rainGeo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    const snowParticleMat=new THREE.ShaderMaterial({uniforms:{uViewportHeight:{value:renderer.domElement.height},uPixelRatio:{value:renderer.getPixelRatio()}},transparent:true,depthWrite:false,depthTest:true,
      vertexShader:`attribute float flakeSize;attribute float flakeOpacity;uniform float uViewportHeight;uniform float uPixelRatio;varying float vAlpha;
        void main(){vec4 viewPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*viewPosition;
          gl_PointSize=clamp(flakeSize*uViewportHeight*projectionMatrix[1][1]/max(1.,-viewPosition.z),.8*uPixelRatio,3.8*uPixelRatio);
          vAlpha=flakeOpacity*smoothstep(.18,.75,position.y)*(1.-smoothstep(16.,17.98,position.y));}`,
      fragmentShader:`varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.;float alpha=(1.-smoothstep(.25,1.,r))*vAlpha;if(alpha<.02)discard;gl_FragColor=vec4(.95,.975,1.,alpha);}`
    });
    const snowPoints=new THREE.Points(rainGeo,snowParticleMat);snowPoints.frustumCulled=false;snowPoints.visible=false;diorama.add(snowPoints);
    const snowStatic=new THREE.Group(),snowRoof=new THREE.Group();snowStatic.visible=snowRoof.visible=false;diorama.add(snowStatic);roofGroup.add(snowRoof);
    const snowMat=new THREE.MeshToonMaterial({color:0xf1f6fb,gradientMap:celRamp,emissive:0xa4b5c6,emissiveIntensity:.25,side:THREE.DoubleSide});
    scene.updateMatrixWorld(true);
    function collectSnowCaps(root,target){
      const positions=[];const inv=target.matrixWorld.clone().invert(),a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
      const mappedRoofs=new Set([...homeRoofMaterials.values()]);
      root.traverse(o=>{
        if(!o.isMesh||o.isInstancedMesh||Array.isArray(o.material)||o.material.transparent||o.material.isShaderMaterial)return;
        o.geometry.computeBoundingBox();const size=o.geometry.boundingBox.getSize(new THREE.Vector3()),worldPos=o.getWorldPosition(new THREE.Vector3());
        if(!mappedRoofs.has(o.material)&&!(size.y<.36&&size.x>1&&size.z>.45&&worldPos.y>2.3))return;
        const geo=o.geometry,index=geo.index,attr=geo.attributes.position,triangles=index?index.count:attr.count;
        for(let i=0;i<triangles;i+=3){
          a.fromBufferAttribute(attr,index?index.getX(i):i).applyMatrix4(o.matrixWorld);b.fromBufferAttribute(attr,index?index.getX(i+1):i+1).applyMatrix4(o.matrixWorld);c.fromBufferAttribute(attr,index?index.getX(i+2):i+2).applyMatrix4(o.matrixWorld);
          n.copy(b).sub(a).cross(c.clone().sub(a)).normalize();if(n.y<.42)continue;
          for(const v of [a,b,c]){v.addScaledVector(n,.028).applyMatrix4(inv);positions.push(...v.toArray());}
        }
      });
      if(positions.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,snowMat);mesh.receiveShadow=true;target.add(mesh);}
    }
    collectSnowCaps(neighborhoodGroup,snowStatic);collectSnowCaps(roofGroup,snowRoof);
    // Opaque raised snow has real thickness; the stream and the main walking path stay open.
    const snowParts=[];
    function snowShape(geo,x,y,z,sx=1,sy=1,sz=1,ry=0){const m=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(0,ry,0)),new THREE.Vector3(sx,sy,sz));const g=geo.index?geo.toNonIndexed():geo.clone();g.applyMatrix4(m);snowParts.push(g);}
    function snowSlab(w,d,x,top,z,thickness=.06){const geo=new THREE.BoxGeometry(w,thickness,d);snowShape(geo,x,top-thickness/2,z);geo.dispose();}
    for(const [w,d,x,y,z] of [[27.8,25,-4.8,.20,-10.3],[6.3,25,15.55,.20,-10.3],[37.4,1.3,0,.23,10.05],[5.6,3.05,15.45,.399,-.10],[2.3,6.2,-12.5,.38,-12.1],
      [6.9,9.6,-5.15,.327,-11.35],[7.1,9.6,4.85,.327,-11.35]])snowSlab(w,d,x,y,z);
    // One connected heightfield per curb: broad soft shoulders, no intersecting ellipsoids.
    function snowBank({axis='x',start,end,center,width=.95,height=.16,baseA=.20,baseB=.048,seed=0}){
      const alongSteps=Math.ceil((end-start)/.17),acrossSteps=12,positions=[],uvs=[],indices=[];
      for(let i=0;i<=alongSteps;i++){
        const along=start+(end-start)*i/alongSteps;
        const taper=THREE.MathUtils.smoothstep(along-start,0,.85)*THREE.MathUtils.smoothstep(end-along,0,.85);
        const halfWidth=width*.5*(1+.10*Math.sin(along*.83+seed)+.045*Math.cos(along*2.07-seed));
        const wander=(.045*Math.sin(along*.63+seed)+.025*Math.sin(along*1.79+seed*2))*taper;
        const rise=height*(.83+.13*Math.sin(along*.72+seed)+.08*Math.sin(along*1.86-seed));
        for(let j=0;j<=acrossSteps;j++){
          const u=j/acrossSteps,across=center+(u-.5)*2*halfWidth+wander;
          const shoulder=Math.pow(Math.sin(u*Math.PI),1.65);
          const base=THREE.MathUtils.lerp(baseA,baseB,THREE.MathUtils.smoothstep(u,0,1));
          const y=base+shoulder*rise*taper;
          positions.push(axis==='x'?along:across,y,axis==='x'?across:along);uvs.push(i/alongSteps,u);
          if(i<alongSteps&&j<acrossSteps){const a=i*(acrossSteps+1)+j,b=a+acrossSteps+1;
            if(axis==='x')indices.push(a,a+1,b,a+1,b+1,b);else indices.push(a,b,a+1,a+1,b,b+1);
          }
        }
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();snowShape(geo,0,0,0);geo.dispose();
    }
    // The cleared crossing interrupts the bank; long irregular ridges merge into the pavement.
    for(const [start,end] of [[-18.5,7.8],[12.7,18.5]]){
      snowBank({start,end,center:2.29,width:1.0,height:.17,seed:.8});
      snowBank({start,end,center:9.30,width:.92,height:.14,baseA:.048,baseB:.231,seed:3.1});
    }
    snowBank({axis:'z',start:-22.65,end:1.95,center:9.18,width:.88,height:.14,seed:4.2});
    snowBank({axis:'z',start:-22.65,end:1.95,center:12.32,width:.88,height:.16,baseA:.048,baseB:.201,seed:6.7});
    // Shallow broad snow lips at the stream merge into the park's blanket.
    snowBank({axis:'z',start:-15.8,end:-6.9,center:-1.78,width:.70,height:.075,baseA:.327,baseB:.302,seed:1.2});
    snowBank({axis:'z',start:-15.8,end:-6.9,center:.32,width:.70,height:.065,baseA:.302,baseB:.327,seed:2.9});
    // Two-ball snowman on the near pavement, facing the viewer; all parts merge by material.
    const snowman=new THREE.Group();snowman.position.set(10.7,.23,10.0);snowman.rotation.y=.45;snowStatic.add(snowman);
    function snowmanPart(geo,mat,x,y,z){const mesh=new THREE.Mesh(geo,mat);mesh.position.set(x,y,z);snowman.add(mesh);return mesh;}
    snowmanPart(new THREE.SphereGeometry(.56,18,12),snowMat,0,.51,0).scale.y=.94;
    snowmanPart(new THREE.SphereGeometry(.38,16,10),snowMat,0,1.21,.015);
    const coalMat=new THREE.MeshToonMaterial({color:0x23313a,gradientMap:celRamp}),scarfMat=new THREE.MeshToonMaterial({color:0xb84942,gradientMap:celRamp}),carrotMat=new THREE.MeshToonMaterial({color:0xe89b43,gradientMap:celRamp});
    for(const x of [-.125,.125])snowmanPart(new THREE.SphereGeometry(.044,7,5),coalMat,x,1.29,.36);
    for(const y of [.42,.64,.82])snowmanPart(new THREE.SphereGeometry(.045,7,5),coalMat,0,y,.52);
    for(let i=0;i<5;i++){const a=(i/4-.5)*1.35;snowmanPart(new THREE.SphereGeometry(.023,6,4),coalMat,Math.sin(a)*.17,1.135-Math.cos(a)*.045,.36);}
    const nose=snowmanPart(new THREE.ConeGeometry(.065,.26,9),carrotMat,0,1.22,.46);nose.rotation.x=Math.PI/2;
    const scarf=snowmanPart(new THREE.TorusGeometry(.29,.065,7,20),scarfMat,0,1.0,0);scarf.rotation.x=Math.PI/2;
    const scarfTail=snowmanPart(new THREE.BoxGeometry(.16,.40,.07),scarfMat,.23,.80,.35);scarfTail.rotation.z=-.2;
    snowmanPart(new THREE.CylinderGeometry(.32,.34,.08,16),coalMat,0,1.54,0);
    snowmanPart(new THREE.CylinderGeometry(.23,.25,.30,16),coalMat,0,1.72,0);
    snowmanPart(new THREE.CylinderGeometry(.253,.259,.055,16),scarfMat,0,1.60,0);
    function twig(a,b){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),d=vb.clone().sub(va);const o=snowmanPart(new THREE.CylinderGeometry(.018,.026,d.length(),6),coalMat,...va.add(vb).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
    for(const s of [-1,1]){twig([s*.40,.75,0],[s*.86,1.03,.02]);twig([s*.76,.97,.02],[s*.81,1.17,.02]);}
    const packedGeo=mergeGeometries(snowParts);snowParts.forEach(g=>g.dispose());const packedSnow=new THREE.Mesh(packedGeo,snowMat);packedSnow.receiveShadow=true;snowStatic.add(packedSnow);
    snowman.updateMatrix();const snowmanBuckets=new Map();for(const o of snowman.children){o.updateMatrix();const g=o.geometry.toNonIndexed();g.applyMatrix4(o.matrix);if(!snowmanBuckets.has(o.material))snowmanBuckets.set(o.material,[]);snowmanBuckets.get(o.material).push(g);o.geometry.dispose();}snowman.clear();
    for(const [mat,parts] of snowmanBuckets){const m=new THREE.Mesh(mergeGeometries(parts),mat);parts.forEach(g=>g.dispose());m.castShadow=m.receiveShadow=true;snowman.add(m);}
    // Slushy asphalt remains visible in four worn tyre tracks, with white snow between them.
    function snowyRoad(w,d,x,z,across){
      const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#edf3f8';ctx.fillRect(0,0,c.width,c.height);
      ctx.globalCompositeOperation='destination-out';
      const tracks=across?[3.48,4.62,6.78,7.92]:[9.8,11.0];
      for(const v of tracks){const axis=across?(v-2.3)/7:(v-9.3)/2.9,center=axis*(across?256:1024),span=across?256/7:1024/2.9;const grad=across?ctx.createLinearGradient(0,center-span*.38,0,center+span*.38):ctx.createLinearGradient(center-span*.38,0,center+span*.38,0);grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(.25,'rgba(0,0,0,.88)');grad.addColorStop(.75,'rgba(0,0,0,.88)');grad.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=grad;ctx.fillRect(across?0:center-span*.38,across?center-span*.38:0,across?1024:span*.76,across?span*.76:256);}
      ctx.globalCompositeOperation='source-over';const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshToonMaterial({map:tex,color:0xf1f5f9,emissive:0x71869a,emissiveIntensity:.18,gradientMap:celRamp,transparent:true,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.048,z);mesh.renderOrder=1;mesh.receiveShadow=true;snowStatic.add(mesh);
    }
    snowyRoad(37.4,7,0,5.8,true);snowyRoad(2.9,24.3,10.75,-9.85,false);
    camPresets.snowman={pos:[16,4.4,17.5],target:[10.7,1.0,9.9]};
    const snowFocus=document.createElement('button');snowFocus.className='btn';snowFocus.textContent='☃️ 路边雪人与积雪';snowFocus.id='snow-closeup';snowFocus.style.width='100%';document.querySelector('[data-weather]').parentElement.after(snowFocus);snowFocus.addEventListener('click',()=>{setWeatherMode('snow');navigateTo('snowman');document.getElementById('ui-panel').classList.add('collapsed');syncFoldButtons();});
    skyPresets.snowDay={label:'❄️ 雪天灰蓝',top:0x253749,mid:0x667b91,bot:0xb3c1d0,hemiSky:0xc1d3e2,hemiGnd:0x596a7c,hemiInt:.87,moonCol:0xb8cee0,moonInt:.80};
    function setWeatherMode(mode){
      const previous=weatherMode;
      if(mode==='snow'&&previous!=='snow'){snowTime=0;updateSnow(0);lastNonSnowSky=document.querySelector('[data-sky].active')?.dataset.sky||'rainNight';applySkyPresetImmediate('snowDay');}
      if(previous==='snow'&&mode!=='snow'&&document.getElementById('sky-label').textContent===skyPresets.snowDay.label)applySkyPresetImmediate(lastNonSnowSky);
      weatherMode=mode;if(mode!=='clear')lastPrecipitation=mode;rainActive=mode==='rain';snowActive=mode==='snow';rainLines.visible=rainActive;snowPoints.visible=snowActive;snowStatic.visible=snowRoof.visible=snowActive;
      document.body.dataset.weather=mode;roadMirror.visible=!snowActive&&Number(document.getElementById('wet-slider').value)>.02;wetRoadOverlay.material.opacity=snowActive?.96:1-Number(document.getElementById('wet-slider').value);
      document.querySelector('#studio-header p').textContent=mode==='snow'?'雪落屋檐，灯还亮着。 / 星野マート 24H':'雨落街角，灯还亮着。 / 星野マート 24H';
      rainGlassUniforms.uActive.value=rainActive?1:0;ripples.forEach(r=>r.mesh.visible=rainActive);eaveDrops.forEach(r=>r.mesh.visible=rainActive);
      document.querySelectorAll('[data-weather]').forEach(b=>{b.classList.toggle('active',b.dataset.weather===mode);b.setAttribute('aria-pressed',String(b.dataset.weather===mode));});
      const button=document.getElementById('toggle-rain');button.classList.toggle('active',mode!=='clear');button.textContent=mode==='snow'?'❄️ 飘雪: 开':mode==='rain'?'🌧️ 降雨: 开':'降水: 关';
      renderer.shadowMap.needsUpdate=true;
    }
    function setRainState(active){setWeatherMode(active?lastPrecipitation:'clear');}
    function updateSnow(dt){
      snowTime+=dt*1.5;stepSnowField(snowField,snowTime,rainGeo.attributes.position.array);rainGeo.attributes.position.needsUpdate=true;
      snowParticleMat.uniforms.uViewportHeight.value=renderer.domElement.height;snowParticleMat.uniforms.uPixelRatio.value=renderer.getPixelRatio();
    }
    document.querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>setWeatherMode(b.dataset.weather)));
    document.getElementById('wet-slider').addEventListener('input',()=>{if(snowActive){roadMirror.visible=false;wetRoadOverlay.material.opacity=.96;}});
    setWeatherMode('rain');

    // The diorama is now an observation workspace, with no bottom tour/player UI.
    document.getElementById('video-player-bar')?.remove();document.getElementById('subtitle-overlay')?.remove();document.getElementById('btn-toggle-sub')?.remove();document.getElementById('feature-hud')?.remove();
