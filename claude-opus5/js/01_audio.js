'use strict';
/* ============ 坐标猎场 · 程序化合成音效(WebAudio,零素材) ============ */
const SFX = (() => {
  let ctx = null, master = null, noiseBuf = null, on = true, volume = 0.8;
  function ensure(){
    if (ctx) return true;
    try{
      ctx = new (window.AudioContext||window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = volume;
      const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=14000;
      master.connect(lp); lp.connect(ctx.destination);
      const len = ctx.sampleRate*2; noiseBuf = ctx.createBuffer(1,len,ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    }catch(e){ ctx=null; return false; }
    return true;
  }
  function outOfBand(){ if(!ensure()||!on) return; if(ctx.state==='suspended') ctx.resume(); }
  function noise(dur,{f=1200,q=0.8,g=0.2,type='bandpass',a=0.004,r=0.09,att=1}={}){
    if(!outOfBand()) return;
    const t=ctx.currentTime, src=ctx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    const flt=ctx.createBiquadFilter(); flt.type=type; flt.frequency.value=f; flt.Q.value=q;
    const gn=ctx.createGain();
    gn.gain.setValueAtTime(0,t); gn.gain.linearRampToValueAtTime(g*att,t+a);
    gn.gain.setTargetAtTime(0,t+a,r);
    src.connect(flt);flt.connect(gn);gn.connect(master);
    src.start(t); src.stop(t+dur+0.1);
  }
  function tone(freq,{dur=0.2,g=0.15,type='sine',slide=0,a=0.004,r=0.12,att=1}={}){
    if(!outOfBand()) return;
    const t=ctx.currentTime,o=ctx.createOscillator(),gn=ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),t+dur);
    gn.gain.setValueAtTime(0,t); gn.gain.linearRampToValueAtTime(g*att,t+a);
    gn.gain.setTargetAtTime(0,t+dur*0.6,r);
    o.connect(gn); gn.connect(master); o.start(t); o.stop(t+dur+0.2);
  }
  return {
    unlock(){ ensure(); if(ctx&&ctx.state==='suspended') ctx.resume(); },
    set vol(v){ volume=U.clamp(v,0,1); if(master) master.gain.value=volume; },
    set enabled(v){ on=!!v; },
    get enabled(){ return on; },
    /* —— 事件音 —— */
    shoot(){ noise(0.22,{f:1700,q:0.7,g:0.5,type:'bandpass',r:0.09});
             tone(140,{dur:0.16,g:0.4,type:'triangle',slide:-90,r:0.07}); },
    hit(){ tone(230,{dur:0.09,g:0.45,type:'square',slide:-120,r:0.03});
           tone(80,{dur:0.22,g:0.35,type:'sine',slide:-30,r:0.1}); },
    hurt(){ tone(96,{dur:0.34,g:0.5,type:'sawtooth',slide:-55,r:0.14});
            noise(0.3,{f:600,q:0.6,g:0.22,type:'lowpass',r:0.14}); },
    nearmiss(){ noise(0.3,{f:2600,q:1.4,g:0.24,type:'bandpass',r:0.13}); },
    detectorSnd(){ tone(880,{dur:0.08,g:0.16,type:'sine'}); tone(1320,{dur:0.1,g:0.14,type:'sine',a:0.06}); },
    detected(){ tone(520,{dur:0.12,g:0.28,type:'square',slide:-160}); },
    step(){ noise(0.05,{f:300+Math.random()*160,q:0.8,g:0.05,type:'lowpass',att:0.3,r:0.03}); },
    sprint(){ noise(0.06,{f:260,q:0.7,g:0.055,type:'lowpass',att:0.3,r:0.03}); },
    shotNear(){ noise(0.5,{f:240,q:0.5,g:0.5,type:'lowpass',r:0.2}); tone(60,{dur:0.4,g:0.3,type:'sine',slide:-16,r:0.2}); },
    kill(){ tone(392,{dur:0.1,g:0.2,type:'square'});tone(494,{dur:0.12,g:0.2,type:'square',a:0.08});tone(587,{dur:0.3,g:0.22,type:'square',a:0.16,r:0.16}); },
    death(){ tone(300,{dur:0.4,g:0.3,type:'sawtooth',slide:-180,r:0.2}); tone(150,{dur:0.6,g:0.28,type:'sine',slide:-80,r:0.3}); },
    countdown(n){ if(n===0){tone(660,{dur:0.4,g:0.2,type:'sine'});tone(990,{dur:0.4,g:0.14,type:'sine',a:0.12});}
                  else tone(440,{dur:0.12,g:0.16,type:'sine'}); },
    tick(){ tone(880,{dur:0.05,g:0.1,type:'sine'}); },
    win(){ [523,659,784,1046].forEach((f,i)=>tone(f,{dur:0.35,g:0.18,type:'triangle',a:i*0.12,r:0.25})); },
    lose(){ [392,330,262,196].forEach((f,i)=>tone(f,{dur:0.4,g:0.16,type:'sine',a:i*0.14,r:0.3})); },
    uiClick(){ tone(1200,{dur:0.03,g:0.08,type:'sine'}); },
  };
})();
