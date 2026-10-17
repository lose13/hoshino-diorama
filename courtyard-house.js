    // A Showa suburban family house: two unequal gables, a bay window and an enclosed garden.
    const courtyardHouse=new THREE.Group();courtyardHouse.position.set(15.45,.22,-2.25);courtyardHouse.name='昭和绿瓦小院';neighborhoodGroup.add(courtyardHouse);
    {
      const g=courtyardHouse,p=homePalette;
      homeBox(g,5.95,.11,8.1,0x8b8d7d,0,.055,-.25);
      homeBox(g,5.60,.055,3.05,0x677f59,0,.14,2.15);
      // Raised foundation, recessed upper story, and a low genkan wing.
      homeBox(g,5.18,.35,4.0,0x94938a,0,.24,-1.55,true);
      homeBox(g,5.10,2.22,3.94,p.plaster,0,1.51,-1.55,true);
      homeBox(g,3.42,2.12,3.78,0xece2cc,-.79,3.62,-1.63,true);
      homeBox(g,5.18,.13,4.05,p.trim,0,2.57,-1.55);
      const upperRoof=createKirizumaRoof({w:3.50,d:3.85,pitchH:1.02,tileCol:p.roof,timberCol:p.trim,wallCol:0xece2cc,ridgeAlongX:false});upperRoof.position.set(-.79,4.69,-1.63);g.add(upperRoof);
      const lowerRoof=createKirizumaRoof({w:1.65,d:3.92,pitchH:.59,tileCol:0x527c6a,timberCol:p.trim,wallCol:p.plaster,ridgeAlongX:false});lowerRoof.position.set(1.75,2.64,-1.57);g.add(lowerRoof);
      // Bay projects into the garden, with three pieces of glass and a shallow green cap.
      homeBox(g,2.44,1.42,.42,0x7e6e57,-1.05,1.56,.60);
      homeWindow(g,2.22,1.20,-1.05,1.58,.823);
      const bayCap=createHisashiEave(2.75,.71,0x4f7968,p.trim);bayCap.position.set(-1.05,2.36,.64);g.add(bayCap);
      homeBox(g,2.55,.095,.63,p.trim,-1.05,.83,.67);
      homeWindow(g,2.07,1.22,-.80,3.64,.285);
      homeWindow(g,1.12,1.05,2.575,1.59,-1.22,Math.PI/2);
      homeWindow(g,1.37,1.17,.945,3.60,-1.34,Math.PI/2,'cool');
      homeWindow(g,1.30,1.02,-2.565,1.62,-1.95,-Math.PI/2,'warm',false);
      homeWindow(g,1.22,1.05,-.76,3.59,-3.545,Math.PI,'warm',false);
      homeWindow(g,1.14,1.04,1.72,1.57,-3.535,Math.PI,'shoji');
      // Solid timber entry, transom, door furniture and a tiny umbrella shelf.
      homeBox(g,.91,1.99,.13,0x6b4b37,1.70,1.37,.48,true);
      for(let i=0;i<6;i++)homeBox(g,.021,1.77,.018,0x936c49,1.34+i*.143,1.34,.555);
      homeWindow(g,.72,.35,1.70,2.30,.56,0,'shoji');
      homeBox(g,.035,.23,.04,0xc1b291,1.99,1.35,.586);
      homeBox(g,1.35,.18,.83,0xa5a193,1.67,.23,.91);
      homeBox(g,1.64,.12,.68,0xb4ad98,1.66,.115,1.29);
      const entryEave=createHisashiEave(1.63,1.04,p.roof,p.trim);entryEave.position.set(1.67,2.60,.81);g.add(entryEave);
      homeLamp(g,2.27,2.03,.60);
      const nameplate=makeFrontBackBox(.25,.48,.03,createGraphicSign(120,200,'#ede4cf','#4c5145','青山','3-12'),0x86755d);nameplate.position.set(2.30,1.49,.60);g.add(nameplate);
      // Garden walls have a low concrete foot and individual timber fence boards.
      for(const side of [-1,1]){
        homeBox(g,.13,.48,3.25,0x9c9c91,side*2.84,.36,2.04);
        for(let z=.48;z<3.68;z+=.19)homeBox(g,.075,.46,.10,0x8b7962,side*2.84,.81,z);
        homeRod(g,[side*2.84,1.06,.45],[side*2.84,1.06,3.69],.038,0x665d4f);
      }
      for(const [x,w] of [[-1.75,2.17],[2.18,1.25]]){
        homeBox(g,w,.48,.14,0x9b9b8f,x,.36,3.72);
        for(let xx=x-w/2+.07;xx<x+w/2;xx+=.18)homeBox(g,.10,.43,.075,0x8b7962,xx,.80,3.72);
        homeBox(g,w,.07,.13,0x665d4f,x,1.03,3.72);
      }
      for(const x of [-.53,1.48]){homeBox(g,.27,1.12,.30,0xa6a395,x,.66,3.72);homeBox(g,.34,.09,.37,0x6f7b70,x,1.265,3.72);}
      // Gate is partly open, leaving the stepping-stone route readable from the street.
      const gate=new THREE.Group();gate.position.set(-.39,0,3.72);gate.rotation.y=-.26;g.add(gate);
      for(let x=0;x<1.68;x+=.18)homeBox(gate,.10,.80,.075,0x6b6151,x,.66,0);
      homeBox(gate,1.64,.08,.075,0x6b6151,.78,.36,0);homeBox(gate,1.64,.08,.075,0x6b6151,.78,1.00,0);
      homeLamp(g,1.48,1.36,3.72);
      homeBox(g,.27,.31,.11,0x8b4d3e,1.48,.92,3.91);homeBox(g,.20,.024,.02,0x393d37,1.48,1.00,3.98);
      const address=makeFrontBackBox(.20,.33,.012,createGraphicSign(100,180,'#efe7d4','#52564a','青山','3-12'),0x77786b);address.position.set(-.53,.86,3.89);g.add(address);
      for(let i=0;i<5;i++)homeBox(g,.66,.045,.43,i%2?0xb1aa98:0xa09d8d,.5+i*.14,.204,3.35-i*.47);
      // Low shrubs, a clipped garden tree, stepping stones, flower pots, hose and watering can.
      for(let i=0;i<7;i++){const bush=new THREE.Mesh(new THREE.IcosahedronGeometry(.23,1),makeCelMat(i%2?0x607f51:0x748b5a));bush.position.set(-2.42+i*.39,.40,3.17);bush.scale.set(1,.75,.90);g.add(bush);}
      homeRod(g,[-1.68,.20,1.99],[-1.59,1.53,1.90],.075,0x69513b);
      for(let i=0;i<17;i++){let a=i*2.399;const leaf=new THREE.Mesh(new THREE.IcosahedronGeometry(.22+(i%3)*.035,1),makeCelMat(i%2?0x718759:0x5a784f));leaf.position.set(-1.59+Math.cos(a)*.38,1.30+(i%4)*.16,1.90+Math.sin(a)*.32);leaf.scale.y=.8;g.add(leaf);}
      homePlanter(g,2.23,.18,1.42,0x9c7256,true);homePlanter(g,2.31,.18,2.09,0x8c755c,true);homePlanter(g,-2.17,.18,1.19);
      const hose=new THREE.Mesh(new THREE.TorusGeometry(.21,.022,6,24,Math.PI*1.85),makeCelMat(0x6d8a71));hose.rotation.y=Math.PI/2;hose.position.set(2.66,.55,-.05);g.add(hose);
      const can=new THREE.Mesh(new THREE.CylinderGeometry(.13,.14,.25,9),makeCelMat(0x668d83));can.position.set(2.30,.29,.49);g.add(can);homeRod(g,[2.30,.37,.49],[2.10,.48,.58],.035,0x668d83);
      // Upper balcony, laundry, side cladding, drains and visible service details.
      homeBox(g,2.57,.10,.54,0x898c83,-.80,2.98,.57);
      for(let i=0;i<13;i++)homeBox(g,.026,.57,.032,0x69756e,-1.96+i*.19,3.30,.83);
      homeRod(g,[-2.02,3.60,.83],[.42,3.60,.83],.024,0x69756e);
      homeRod(g,[-1.77,4.31,.54],[.17,4.31,.54],.014,0xa4aaa0);
      for(let i=0;i<3;i++){const cloth=homeBox(g,.32,.43,.023,[0xdbd4b8,0xa6b8b9,0xc2b0a5][i],-1.51+i*.50,4.05,.54);cloth.rotation.z=(i-1)*.06;}
      for(const x of [-2.53,2.53]){homeRod(g,[x,.22,-3.49],[x,2.59,-3.49],.035,0x74796e);homeBox(g,.13,.055,4.10,0x74796e,x,2.57,-1.55);}
      for(let y=.55;y<2.5;y+=.22)homeBox(g,.028,.018,3.84,0xc3b79c,2.565,y,-1.55);
      const ac=createACUnit();ac.position.set(2.64,.23,-2.65);ac.rotation.y=Math.PI/2;g.add(ac);
    }


