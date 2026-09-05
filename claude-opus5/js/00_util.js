'use strict';
/* ============ 坐标猎场 · 工具模块 ============ */
const U = {
  clamp:(v,a,b)=>v<a?a:v>b?b:v,
  lerp:(a,b,t)=>a+(b-a)*t,
  rand:(a=1,b)=> b===undefined ? Math.random()*a : a+Math.random()*(b-a),
  dist:(x1,z1,x2,z2)=>Math.hypot(x2-x1,z2-z1),
  TAU:Math.PI*2,
};
function hash2(x,z){let h=(x*374761393+z*668265263)|0;h=(h^(h>>13))*1274126177;h^=h>>16;return (h>>>0)/4294967295;}
