    // Batch static city meshes by material, render flags and 8m spatial cell.
    // Dynamic roof, doors, traffic, weather and swaying crowns retain independent ownership.
    const performanceParams=new URLSearchParams(location.search);
    const dynamicRoots=new Set([roofGroup,doorLeft,doorRight,trafficGroup,snowStatic,snowRoof,...sakuraCanopies.map(c=>c.group),...ripples.map(r=>r.mesh),...eaveDrops.map(d=>d.mesh)]);
    let batchRemoved=0,batchCreated=0;
    function batchStaticCity(){
      scene.updateMatrixWorld(true);const buckets=new Map(),removed=[],removedLines=new Set(),oldGeometries=new Set();
      const inverse=diorama.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),center=new THREE.Vector3();
      diorama.traverse(o=>{
        if((!o.isMesh&&!o.isLineSegments)||o.isInstancedMesh||o===roadMirror||Array.isArray(o.material)||(!o.isLineSegments&&(o.material?.transparent||o.material?.isShaderMaterial)))return;
        for(let p=o;p&&p!==diorama;p=p.parent)if(dynamicRoots.has(p)||!p.visible)return;
        if(!o.geometry?.attributes.position)return;
        o.geometry.computeBoundingSphere();center.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
        const attributes=Object.keys(o.geometry.attributes).sort().join(',');
        const key=[o.isLineSegments?'line':'mesh',o.material.uuid,o.layers.mask,+o.castShadow,+o.receiveShadow,o.renderOrder,attributes,Math.floor(center.x/8),Math.floor(center.z/8)].join(':');
        if(!buckets.has(key))buckets.set(key,{source:o,parts:[],objects:[]});
        const part=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();matrix.copy(inverse).multiply(o.matrixWorld);part.applyMatrix4(matrix);
        const bucket=buckets.get(key);bucket.parts.push(part);bucket.objects.push(o);
      });
      for(const bucket of buckets.values()){
        if(bucket.parts.length<2){bucket.parts.forEach(g=>g.dispose());continue;}
        const merged=mergeGeometries(bucket.parts,false);bucket.parts.forEach(g=>g.dispose());if(!merged)continue;
        merged.computeBoundingSphere();const original=bucket.source,newObject=original.isLineSegments?new THREE.LineSegments(merged,original.material):new THREE.Mesh(merged,original.material);
        newObject.layers.mask=original.layers.mask;newObject.castShadow=original.castShadow;newObject.receiveShadow=original.receiveShadow;newObject.renderOrder=original.renderOrder;newObject.name='静态街区合批';
        for(const o of bucket.objects){removed.push(o);oldGeometries.add(o.geometry);if(o.isLineSegments)removedLines.add(o);}
        diorama.add(newObject);batchCreated++;if(newObject.isLineSegments)allInkLines.push(newObject);
      }
      for(const o of removed)o.removeFromParent();batchRemoved=removed.length;
      const activeInk=allInkLines.filter(l=>!removedLines.has(l));allInkLines.length=0;allInkLines.push(...activeInk);
      function prune(group){for(const c of [...group.children]){if(c.isGroup&&!dynamicRoots.has(c)){prune(c);if(!c.children.length)group.remove(c);}}}
      prune(diorama);
      const liveGeometry=new Set();scene.traverse(o=>{if(o.geometry)liveGeometry.add(o.geometry);});for(const g of oldGeometries)if(!liveGeometry.has(g))g.dispose();
    }
    if(performanceParams.get('batch')!=='0')batchStaticCity();
    if(performanceParams.get('batch')!=='0'){
      // Additive light is order-independent, so the shared warm/cool shafts and pools can merge.
      const buckets=new Map();residentialEffects.updateMatrixWorld(true);
      for(const o of [...residentialEffects.children]){if(!o.isMesh||o.material.blending!==THREE.AdditiveBlending)continue;const key=o.material.uuid;if(!buckets.has(key))buckets.set(key,{source:o,parts:[],objects:[]});const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrix);buckets.get(key).parts.push(g);buckets.get(key).objects.push(o);}
      for(const b of buckets.values()){const geo=mergeGeometries(b.parts);b.parts.forEach(g=>g.dispose());if(!geo)continue;const m=new THREE.Mesh(geo,b.source.material);m.renderOrder=b.source.renderOrder;residentialEffects.add(m);for(const o of b.objects){o.removeFromParent();o.geometry.dispose();}batchRemoved+=b.objects.length;batchCreated++;}
    }

    // Distant blossoms keep all their instances and silhouette, with fewer triangles per flower.
    const farFlowerGeo=(()=>{
      const pos=[],color=[],base=new THREE.Color(0xe6b2be),tip=new THREE.Color(0xffede5),outline=[];
      for(let petal=0;petal<5;petal++)for(const [offset,r] of [[-.61,.25],[-.22,1],[0,.9],[.22,1]]){const a=petal*Math.PI*2/5+offset;outline.push([Math.cos(a)*r,Math.sin(a)*r,.04]);}
      for(let i=0;i<outline.length;i++){pos.push(0,0,0,...outline[i],...outline[(i+1)%outline.length]);color.push(base.r,base.g,base.b,tip.r,tip.g,tip.b,tip.r,tip.g,tip.b);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));g.computeVertexNormals();return g;
    })();
    const blossomLods=[];scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isInstancedMesh&&o.geometry===sakuraFlowerGeo)blossomLods.push({mesh:o,position:o.getWorldPosition(new THREE.Vector3())});});
    // Freeze only fully static branches. Doors, roof, traffic, weather and crowns keep updating.
    let staticTransformsFrozen=0;
    scene.updateMatrixWorld(true);
    function freezeStaticTransforms(root){
      if(dynamicRoots.has(root))return;
      root.matrixAutoUpdate=false;root.matrixWorldAutoUpdate=false;staticTransformsFrozen++;
      for(const child of root.children)freezeStaticTransforms(child);
    }
    for(const child of diorama.children)freezeStaticTransforms(child);
    // One fixed renderer: original full-resolution cap, 512px reflections and enabled shadows.
    // Never lower resolution, remove shadows or skip reflection frames in response to low FPS.
    let nextSceneFrame=0,sceneWorkStarted=0;
    function shouldRenderScene(now){if(document.hidden||now+1<nextSceneFrame)return false;nextSceneFrame=now+1000/60;sceneWorkStarted=now;return true;}
    let perfFrames=0,perfTime=performance.now(),lastLodTime=0,callsMax=0,trianglesMax=0;
    function updateScenePerformance(dt){
      perfFrames++;callsMax=Math.max(callsMax,renderer.info.render.calls);trianglesMax=Math.max(trianglesMax,renderer.info.render.triangles);const now=performance.now();
      if(now-lastLodTime>220){for(const b of blossomLods)b.mesh.geometry=camera.position.distanceTo(b.position)<36?sakuraFlowerGeo:farFlowerGeo;lastLodTime=now;}
      if(now-perfTime<750)return;
      const fps=Math.round(perfFrames*1000/(now-perfTime)),el=document.getElementById('perf-details');el.textContent=`${fps} FPS`;
      fpsBadge.textContent=`⚡ ${fps} FPS`;
      el.dataset.drawCalls=String(callsMax);el.dataset.triangles=String(trianglesMax);el.dataset.batchRemoved=String(batchRemoved);el.dataset.batchCreated=String(batchCreated);
      el.dataset.frameWorkMs=(performance.now()-sceneWorkStarted).toFixed(1);
      el.dataset.staticTransformsFrozen=String(staticTransformsFrozen);el.dataset.pixelRatio=String(renderer.getPixelRatio());el.dataset.reflectionSize=String(roadMirror.getRenderTarget().width);el.dataset.shadowsEnabled=String(renderer.shadowMap.enabled);
      const coverage=[...lightingCoverage.values()];el.dataset.lightingCoverage=JSON.stringify(coverage);
      perfFrames=0;perfTime=now;callsMax=0;trianglesMax=0;
    }
    document.addEventListener('visibilitychange',()=>{perfFrames=0;perfTime=performance.now();callsMax=0;trianglesMax=0;nextSceneFrame=0;});
