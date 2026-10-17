    // Road paint is shaded in the asphalt fragment itself: no stacked faces or depth bias.
    wetRoadOverlay.name='湿路与同表面交通标线';
    wetRoadOverlay.material.onBeforeCompile=shader=>{
      shader.uniforms.uRoadPaintWhite={value:new THREE.Color(0xe2e8f0)};
      shader.uniforms.uRoadPaintGray={value:new THREE.Color(0x94a3b8)};
      shader.vertexShader='varying vec2 vRoadPaintWorld;\n'+shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoadPaintWorld=(modelMatrix*vec4(transformed,1.)).xz;');
      shader.fragmentShader=`varying vec2 vRoadPaintWorld;
        uniform vec3 uRoadPaintWhite;uniform vec3 uRoadPaintGray;
        float roadPaintBox(vec2 p,vec2 center,vec2 halfSize){
          vec2 aa=max(fwidth(p),vec2(.002));
          vec2 coverage=1.-smoothstep(halfSize-aa,halfSize+aa,abs(p-center));
          return coverage.x*coverage.y;
        }
        float roadPaintBand(float p,float origin,float period,float halfWidth){
          float distanceToCenter=abs(mod(p-origin+period*.5,period)-period*.5);
          float aa=max(fwidth(p),.002);
          return 1.-smoothstep(halfWidth-aa,halfWidth+aa,distanceToCenter);
        }
      `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 roadP=vRoadPaintWorld;
        float crossingMain=roadPaintBox(roadP,vec2(6.2,5.73),vec2(1.175,3.06))*roadPaintBand(roadP.y,2.85,.72,.18);
        float crossingSide=roadPaintBox(roadP,vec2(10.64,1.15),vec2(1.4,.825))*roadPaintBand(roadP.x,9.4,.62,.16);
        float stopLine=roadPaintBox(roadP,vec2(3.6,7.35),vec2(.13,1.5));
        float roadWhite=max(max(crossingMain,crossingSide),stopLine);
        float dashRange=max(roadPaintBox(roadP,vec2(-6.7,5.75),vec2(11.225,.07)),roadPaintBox(roadP,vec2(14.3,5.75),vec2(2.225,.07)));
        float roadGray=dashRange*roadPaintBand(roadP.x,-17.2,3.,.725);
        float roadPaint=max(roadWhite,roadGray);
        diffuseColor.rgb=mix(diffuseColor.rgb,uRoadPaintGray,roadGray);
        diffuseColor.rgb=mix(diffuseColor.rgb,uRoadPaintWhite,roadWhite);
        diffuseColor.a=mix(diffuseColor.a,1.,roadPaint);
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.82,roadPaint);');
    };
    // Snow lies over the asphalt and paint; light pools and shafts remain above that layer.
    for(const light of [sidewalkSpillMesh,roadSpillMesh,sideSpillMesh])light.renderOrder=2;
    for(const beam of volumetricBeams)beam.renderOrder=3;
