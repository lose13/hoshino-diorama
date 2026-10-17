    function finishStoreSignTexture(canvas,name){
      const tex=new THREE.CanvasTexture(canvas);tex.name=name;tex.colorSpace=THREE.SRGBColorSpace;
      tex.anisotropy=Math.min(16,renderer.capabilities.getMaxAnisotropy());tex.generateMipmaps=true;
      tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;
      return tex;
    }
    function createFasciaTexture(){
      // 4096:320 matches the physical 11.9:.92 fascia; letters retain their proper proportions.
      const c=document.createElement('canvas');c.width=4096;c.height=320;const ctx=c.getContext('2d');
      ctx.fillStyle='#fffdf3';ctx.fillRect(0,0,4096,320);
      ctx.fillStyle='#0284c7';ctx.fillRect(0,0,4096,36);
      ctx.fillStyle='#f5a91a';ctx.fillRect(0,282,4096,16);ctx.fillStyle='#dc2850';ctx.fillRect(0,298,4096,22);
      const jp='"Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';
      ctx.fillStyle='#eaa522';ctx.beginPath();ctx.roundRect(48,55,208,208,22);ctx.fill();
      ctx.fillStyle='#fffdf3';ctx.font=`900 154px ${jp}`;ctx.textAlign='center';ctx.fillText('星',152,219);
      ctx.fillStyle='#142d3b';ctx.textAlign='left';ctx.font=`900 184px ${jp}`;ctx.fillText('星野マート',316,222);
      ctx.fillStyle='#075c8a';ctx.font='800 122px "Segoe UI",Arial,sans-serif';ctx.fillText('HOSHINO MART',1400,160);
      ctx.fillStyle='#334650';ctx.font=`700 58px ${jp}`;ctx.fillText('銀行ATM · 珈琲 · お酒',1406,240);
      ctx.fillStyle='#cf2448';ctx.beginPath();ctx.roundRect(3070,61,956,204,22);ctx.fill();
      ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.font='900 142px "Segoe UI",Arial,sans-serif';ctx.fillText('24H OPEN',3548,181);
      ctx.font=`700 52px ${jp}`;ctx.fillText('年中無休 · 桜町三丁目店',3548,243);
      ctx.strokeStyle='#243a45';ctx.lineWidth=5;ctx.strokeRect(2.5,2.5,4091,315);
      return finishStoreSignTexture(c,'便利店正面高清门头');
    }
    function createSideFasciaTexture(){
      const c=document.createElement('canvas');c.width=1536;c.height=384;const ctx=c.getContext('2d');
      ctx.fillStyle='#fffdf3';ctx.fillRect(0,0,1536,384);ctx.fillStyle='#0284c7';ctx.fillRect(0,0,1536,42);
      ctx.fillStyle='#f5a91a';ctx.fillRect(0,340,1536,18);ctx.fillStyle='#dc2850';ctx.fillRect(0,358,1536,26);
      ctx.textAlign='center';ctx.fillStyle='#142d3b';ctx.font='900 168px "Yu Gothic","Meiryo","Microsoft YaHei",sans-serif';ctx.fillText('星野マート',768,224);
      ctx.fillStyle='#075c8a';ctx.font='800 64px "Segoe UI","Microsoft YaHei",sans-serif';ctx.fillText('24H OPEN · 銀行ATM',768,312);
      ctx.strokeStyle='#243a45';ctx.lineWidth=4;ctx.strokeRect(2,2,1532,380);
      return finishStoreSignTexture(c,'便利店侧面高清门头');
    }
