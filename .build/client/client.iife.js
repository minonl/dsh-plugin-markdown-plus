var __mdpClient=(function(u){"use strict";const O="@minonl/dsh-plugin-markdown-plus",k="d5d02f7",$="/dsh-markdown-plus/runtime/mermaid.js",p="data-mdp-state",P=150;function z(e){const t=e.querySelector("code");return t instanceof HTMLElement?t:null}class U{modules;seen=new WeakSet;observer=null;timer=null;queue=Promise.resolve();stopped=!1;notes=new WeakMap;constructor(t){this.modules=t}start(){if(!(this.observer!==null||this.stopped)&&(this.scanDocument(),typeof MutationObserver<"u")){const t=document.body??document.documentElement;this.observer=new MutationObserver(()=>this.schedule()),this.observer.observe(t,{childList:!0,subtree:!0})}}stop(){this.stopped=!0,this.observer?.disconnect(),this.observer=null,this.timer!==null&&clearTimeout(this.timer),this.timer=null;for(const t of this.modules)t.dispose?.()}scan(t=document){const n=t.querySelectorAll("pre");for(const r of n){if(!(r instanceof HTMLElement)||r.hasAttribute(p)||this.seen.has(r))continue;const s=z(r);if(s===null||(s.textContent??"").trim()==="")continue;const i=this.modules.filter(a=>a.test(r,this)).slice(0,1);for(const a of i)this.mark(r,"claimed"),this.enqueue(()=>a.enhance(r,this))}}stateOf(t){const n=t.getAttribute(p);return n==="claimed"||n==="rendered"||n==="degraded"?n:null}mark(t,n){t.setAttribute(p,n),this.seen.add(t)}degrade(t,n,r={}){this.mark(t,"degraded");const s=this.notes.get(t);s!==void 0&&s.remove();const i=document.createElement("div");i.className="mdp-note",i.setAttribute("role","note");const a=document.createElement("span");a.className="mdp-note-label",a.textContent=`图表渲染失败：${n}`,i.append(a);const l=document.createElement("button");l.type="button",l.className="mdp-retry",l.textContent="重试",l.addEventListener("click",()=>{i.remove(),t.removeAttribute(p),this.seen.delete(t),r.retry?.(),this.schedule()}),i.append(l),t.after(i),this.notes.set(t,i)}async idle(){await new Promise(t=>{const n=globalThis;typeof n.requestAnimationFrame=="function"?n.requestAnimationFrame(()=>t()):setTimeout(t,0)})}enqueue(t){this.queue=this.queue.then(()=>t()).then(()=>this.idle()).catch(()=>{})}scanDocument(){const t=()=>{this.timer=null,this.scan(document)};typeof document>"u"||(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",t,{once:!0}):t())}schedule(){this.stopped||this.timer!==null||(this.timer=setTimeout(()=>this.scanDocument(),P))}}let d=null;function F(e){return d!==null||(d=new U(e),d.start()),d}function G(){d?.stop(),d=null}const H=250;function B(e){let t=null,n=null,r=!1;const s=()=>{if(!r)for(const l of e)try{l.refresh(document)}catch(c){console.warn(`[markdown-plus] doc module "${l.id}" failed:`,c)}},i=()=>{r||t!==null||(t=setTimeout(()=>{t=null,s()},H))},a=()=>{s(),!(typeof MutationObserver>"u")&&(n=new MutationObserver(i),n.observe(document.body??document.documentElement,{childList:!0,subtree:!0,characterData:!0}))};return document.readyState==="loading"?document.addEventListener("DOMContentLoaded",a,{once:!0}):a(),{refresh:s,stop(){r=!0,n?.disconnect(),n=null,t!==null&&clearTimeout(t),t=null;for(const l of e)try{l.dispose?.()}catch{}}}}let j=e=>new Function("u","return import(u)")(e);const g=new Map;function V(e){const t=g.get(e);if(t!==void 0)return t;const n=j(e).catch(r=>{throw g.delete(e),r});return g.set(e,n),n}const Y=/^language-(?:mermaid|mermaidjs|mmd)$/i,W=/^\s*([A-Za-z][\w-]*)/,X=new Set(["flowchart","graph","sequenceDiagram","classDiagram","stateDiagram","stateDiagram-v2","erDiagram","gantt","pie","journey","timeline","mindmap","gitGraph","quadrantChart","requirementDiagram","c4Context","c4Container","c4Component","c4Dynamic","c4Deployment","block","packet","architecture-beta","sankey-beta","xychart-beta","zenuml"]),E=5e4,A=2e3;let K=0,Z=`${$}?rev=${encodeURIComponent(k)}`,S=null;function C(e){const t=e.querySelector("code");return t instanceof HTMLElement?t:null}function J(e){return W.exec(e)?.[1]??""}function Q(e){const t=Array.from(e.classList);return t.some(n=>Y.test(n))?!0:t.some(n=>/^language-/i.test(n))?!1:X.has(J(e.textContent??""))}function ee(){const e=document.documentElement,t=e.getAttribute("data-theme")??e.getAttribute("data-color-scheme")??"";return/dark/i.test(t)?!0:/light/i.test(t)?!1:typeof globalThis.matchMedia=="function"&&globalThis.matchMedia("(prefers-color-scheme: dark)").matches}function T(e){const n=(e instanceof Error?e.message:String(e)).split(`
`).map(r=>r.trim()).find(r=>r!=="")??"未知错误";return n.length>200?`${n.slice(0,200)}…`:n}function te(e){const n=e?.default??e;return n===null||typeof n!="object"||typeof n.initialize!="function"||typeof n.render!="function"?null:n}function ne(e){S!==e&&(e.initialize({startOnLoad:!1,securityLevel:"strict",suppressErrorRendering:!0,theme:ee()?"dark":"default"}),S=e)}function re(e,t){const n=document.createElement("div");n.className="mdp-figure",n.setAttribute("role","img"),n.setAttribute("aria-label","Mermaid 图表"),n.innerHTML=t;const r=document.createElement("button");r.type="button",r.className="mdp-toggle",r.textContent="源码",r.setAttribute("aria-pressed","false"),r.addEventListener("click",()=>{const s=e.style.display==="none";e.style.display=s?"":"none",r.setAttribute("aria-pressed",s?"false":"true")}),e.before(n),e.before(r),e.style.display="none"}const oe={id:"mermaid",test(e){const t=C(e);return t!==null&&Q(t)},async enhance(e,t){const n=C(e);if(n===null||t.stateOf(e)==="rendered")return;const r=n.textContent??"",s=r===""?0:r.split(`
`).length;if(r.length>E||s>A){t.degrade(e,`源码过大（${r.length} 字符 / ${s} 行，上限 ${E} / ${A}）`);return}let i;try{const c=te(await V(Z));if(c===null)throw new Error("运行时模块形态不符（缺少 initialize/render）");i=c,ne(i)}catch(c){t.degrade(e,`图表引擎加载失败（${T(c)}）`);return}const a=`mdp-mermaid-${K+=1}`;let l;try{l=(await i.render(a,r)).svg}catch(c){t.degrade(e,T(c));return}!e.isConnected||(n.textContent??"")!==r||(t.stateOf(e)==="degraded"&&e.removeAttribute(p),re(e,l),t.mark(e,"rendered"))}},h="data-mdp-toc",w="data-mdp-toc-item",M="aria-current",ie=2,se=80,_="mdp:toc:collapsed",o={panel:null,list:null,entries:[],activeIndex:-1,collapsed:le(),onScroll:null,rafPending:!1};function le(){try{return globalThis.localStorage?.getItem(_)==="1"}catch{return!1}}function ae(e){try{globalThis.localStorage?.setItem(_,e?"1":"0")}catch{}}function ce(e){const t=e.querySelector("main")??e.body;if(t===null)return[];const n=t.querySelectorAll("h1, h2, h3, h4, h5, h6"),r=[];for(const s of n){if(s.closest(`[${h}]`)!==null||s.closest('pre, code, nav, [aria-hidden="true"]')!==null)continue;const i=(s.textContent??"").replace(/\s+/g," ").trim();i!==""&&r.push({el:s,level:Number(s.tagName.slice(1))||6,text:i})}return r}function ue(e){const t=e.querySelector(`[${h}]`);if(t!==null){const l=t.querySelector(".mdp-toc-list");if(l!==null)return o.panel=t,o.list=l,{panel:t,list:l};t.remove()}const n=e.createElement("nav");n.setAttribute(h,""),n.className="mdp-toc",n.setAttribute("aria-label","文档大纲");const r=e.createElement("div");r.className="mdp-toc-header";const s=e.createElement("span");s.className="mdp-toc-title",s.textContent="大纲";const i=e.createElement("button");i.type="button",i.className="mdp-toc-toggle",i.setAttribute("aria-expanded",String(!o.collapsed)),i.textContent=o.collapsed?"展开":"收起",i.addEventListener("click",()=>{o.collapsed=!o.collapsed,ae(o.collapsed),I()}),r.append(s,i);const a=e.createElement("ol");return a.className="mdp-toc-list",n.append(r,a),e.body.append(n),o.panel=n,o.list=a,I(),{panel:n,list:a}}function I(){if(o.panel===null)return;o.panel.classList.toggle("mdp-toc-collapsed",o.collapsed);const e=o.panel.querySelector(".mdp-toc-toggle");e!==null&&(e.textContent=o.collapsed?"展开":"收起",e.setAttribute("aria-expanded",String(!o.collapsed)))}function L(e){if(o.list===null||e===o.activeIndex)return;const t=o.list.querySelectorAll(`[${w}]`);t.forEach((r,s)=>{s===e?r.setAttribute(M,"true"):r.removeAttribute(M)}),o.activeIndex=e;const n=t[e];n!==void 0&&typeof n.scrollIntoView=="function"&&n.scrollIntoView({block:"nearest"})}function de(e){typeof e.el.scrollIntoView=="function"&&e.el.scrollIntoView({behavior:"smooth",block:"start"})}function D(){if(o.entries.length===0)return;let e=0;for(let t=0;t<o.entries.length&&o.entries[t].el.getBoundingClientRect().top-se<=0;t+=1)e=t;L(e)}function me(){if(o.onScroll!==null)return;const e=()=>{if(o.rafPending)return;o.rafPending=!0;const t=()=>{o.rafPending=!1,D()};typeof globalThis.requestAnimationFrame=="function"?globalThis.requestAnimationFrame(t):setTimeout(t,16)};o.onScroll=e,globalThis.addEventListener?.("scroll",e,{passive:!0})}function pe(e,t,n){const r=Math.min(...n.map(i=>i.level)),s=e.createDocumentFragment();n.forEach((i,a)=>{const l=e.createElement("li");l.className="mdp-toc-entry";const c=e.createElement("button");c.type="button",c.setAttribute(w,String(a)),c.className="mdp-toc-item",c.style.paddingInlineStart=`${(i.level-r)*12+8}px`,c.textContent=i.text,c.title=i.text,c.addEventListener("click",()=>{L(a),de(i)}),l.append(c),s.append(l)}),t.replaceChildren(s)}function N(){o.onScroll!==null&&(globalThis.removeEventListener?.("scroll",o.onScroll),o.onScroll=null),o.panel?.remove(),o.panel=null,o.list=null,o.entries=[],o.activeIndex=-1}const fe={id:"toc",refresh(e){const t=ce(e);if(t.length<ie){N();return}const{list:n}=ue(e);o.entries=t,pe(e,n,t),o.activeIndex=-1,me(),D()},dispose(){N()}},R="mdp/styles",ge=`
.mdp-figure { margin: 8px 0; }
.mdp-figure svg { max-width: 100%; height: auto; }
.mdp-note {
  margin: 4px 0 8px;
  padding: 6px 8px;
  border-left: 3px solid var(--dsw-color-warning, #d97706);
  background: color-mix(in srgb, currentColor 6%, transparent);
  font-size: 12px;
  line-height: 1.6;
  display: flex;
  gap: 8px;
  align-items: center;
}
.mdp-note-label { flex: 1 1 auto; }
.mdp-retry {
  flex: 0 0 auto;
  font: inherit;
  padding: 1px 8px;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.mdp-toggle {
  font: inherit;
  font-size: 12px;
  padding: 1px 8px;
  margin: 2px 0 6px;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.mdp-toc {
  position: fixed;
  top: 96px;
  right: 20px;
  width: 232px;
  max-height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  font-size: 12.5px;
  line-height: 1.5;
  border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, Canvas 92%, currentColor 8%);
  backdrop-filter: blur(6px);
  z-index: 40;
  overflow: hidden;
}
.mdp-toc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}
.mdp-toc-title { flex: 1 1 auto; font-weight: 600; opacity: .85; }
.mdp-toc-toggle {
  font: inherit; font-size: 11px; padding: 1px 6px;
  border: 1px solid color-mix(in srgb, currentColor 25%, transparent);
  border-radius: 4px; background: transparent; color: inherit; cursor: pointer;
}
.mdp-toc-list {
  list-style: none; margin: 0; padding: 4px 0;
  overflow-y: auto; overscroll-behavior: contain;
}
.mdp-toc-entry { margin: 0; }
.mdp-toc-item {
  display: block; width: 100%; text-align: start;
  font: inherit; padding: 3px 8px; border: 0; background: transparent; color: inherit;
  cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  opacity: .75;
}
.mdp-toc-item:hover { background: color-mix(in srgb, currentColor 8%, transparent); opacity: 1; }
.mdp-toc-item[aria-current="true"] {
  opacity: 1; font-weight: 600;
  box-shadow: inset 2px 0 0 currentColor;
  background: color-mix(in srgb, currentColor 10%, transparent);
}
.mdp-toc-collapsed .mdp-toc-list { display: none; }
@media (max-width: 1180px) { .mdp-toc { display: none; } }
`;function he(e=document){if(e.getElementById(R)!==null)return;const t=e.createElement("style");t.id=R,t.textContent=ge,e.head.append(t)}const q=O,b=[oe],x=[fe];let m=null,y=null;function f(e=b){return m!==null?m:typeof document>"u"?(m={scan:()=>{},stop:()=>{},modules:e},m):(he(),m=F(e),y=B(x),m)}function v(){y?.stop(),y=null,G(),m=null}const be={boot:f,stop:v};f();const xe={clientName:q,boot:f,stop:v,defaultModules:b,defaultDocModules:x};return u.__test=be,u.boot=f,u.clientName=q,u.default=xe,u.defaultDocModules=x,u.defaultModules=b,u.stop=v,Object.defineProperties(u,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}}),u})({});
