var __mdpClient=(function(a){"use strict";const _="@minonl/dsh-plugin-markdown-plus",C="edbe73b",S="/dsh-markdown-plus/runtime/mermaid.js",c="data-mdp-state",T=150;function w(t){const e=t.querySelector("code");return e instanceof HTMLElement?e:null}class D{modules;seen=new WeakSet;observer=null;timer=null;queue=Promise.resolve();stopped=!1;notes=new WeakMap;constructor(e){this.modules=e}start(){if(!(this.observer!==null||this.stopped)&&(this.scanDocument(),typeof MutationObserver<"u")){const e=document.body??document.documentElement;this.observer=new MutationObserver(()=>this.schedule()),this.observer.observe(e,{childList:!0,subtree:!0})}}stop(){this.stopped=!0,this.observer?.disconnect(),this.observer=null,this.timer!==null&&clearTimeout(this.timer),this.timer=null;for(const e of this.modules)e.dispose?.()}scan(e=document){const n=e.querySelectorAll("pre");for(const r of n){if(!(r instanceof HTMLElement)||r.hasAttribute(c)||this.seen.has(r))continue;const s=w(r);if(s===null||(s.textContent??"").trim()==="")continue;const i=this.modules.filter(o=>o.test(r,this)).slice(0,1);for(const o of i)this.mark(r,"claimed"),this.enqueue(()=>o.enhance(r,this))}}stateOf(e){const n=e.getAttribute(c);return n==="claimed"||n==="rendered"||n==="degraded"?n:null}mark(e,n){e.setAttribute(c,n),this.seen.add(e)}degrade(e,n,r={}){this.mark(e,"degraded");const s=this.notes.get(e);s!==void 0&&s.remove();const i=document.createElement("div");i.className="mdp-note",i.setAttribute("role","note");const o=document.createElement("span");if(o.className="mdp-note-label",o.textContent=`图表渲染失败：${n}`,i.append(o),r.retry!==void 0){const u=document.createElement("button");u.type="button",u.className="mdp-retry",u.textContent="重试",u.addEventListener("click",()=>{i.remove(),e.removeAttribute(c),this.seen.delete(e),r.retry?.(),this.schedule()}),i.append(u)}e.after(i),this.notes.set(e,i)}async idle(){await new Promise(e=>{const n=globalThis;typeof n.requestAnimationFrame=="function"?n.requestAnimationFrame(()=>e()):setTimeout(e,0)})}enqueue(e){this.queue=this.queue.then(()=>e()).then(()=>this.idle()).catch(()=>{})}scanDocument(){const e=()=>{this.timer=null,this.scan(document)};typeof document>"u"||(document.readyState==="loading"?document.addEventListener("DOMContentLoaded",e,{once:!0}):e())}schedule(){this.stopped||this.timer!==null||(this.timer=setTimeout(()=>this.scanDocument(),T))}}let d=null;function L(t){return d!==null||(d=new D(t),d.start()),d}function I(){d?.stop(),d=null}let N=t=>new Function("u","return import(u)")(t);const p=new Map;function O(t){const e=p.get(t);if(e!==void 0)return e;const n=N(t).catch(r=>{throw p.delete(t),r});return p.set(t,n),n}const R=/^language-(?:mermaid|mermaidjs|mmd)$/i,q=/^\s*([A-Za-z][\w-]*)/,$=new Set(["flowchart","graph","sequenceDiagram","classDiagram","stateDiagram","stateDiagram-v2","erDiagram","gantt","pie","journey","timeline","mindmap","gitGraph","quadrantChart","requirementDiagram","c4Context","c4Container","c4Component","c4Dynamic","c4Deployment","block","packet","architecture-beta","sankey-beta","xychart-beta","zenuml"]),y=5e4,b=2e3;let U=0,z=`${S}?rev=${encodeURIComponent(C)}`,E=null;function A(t){const e=t.querySelector("code");return e instanceof HTMLElement?e:null}function G(t){return q.exec(t)?.[1]??""}function P(t){const e=Array.from(t.classList);return e.some(n=>R.test(n))?!0:e.some(n=>/^language-/i.test(n))?!1:$.has(G(t.textContent??""))}function k(){const t=document.documentElement,e=t.getAttribute("data-theme")??t.getAttribute("data-color-scheme")??"";return/dark/i.test(e)?!0:/light/i.test(e)?!1:typeof globalThis.matchMedia=="function"&&globalThis.matchMedia("(prefers-color-scheme: dark)").matches}function v(t){const n=(t instanceof Error?t.message:String(t)).split(`
`).map(r=>r.trim()).find(r=>r!=="")??"未知错误";return n.length>200?`${n.slice(0,200)}…`:n}function H(t){const n=t?.default??t;return n===null||typeof n!="object"||typeof n.initialize!="function"||typeof n.render!="function"?null:n}function j(t){E!==t&&(t.initialize({startOnLoad:!1,securityLevel:"strict",suppressErrorRendering:!0,theme:k()?"dark":"default"}),E=t)}function B(t,e){const n=document.createElement("div");n.className="mdp-figure",n.setAttribute("role","img"),n.setAttribute("aria-label","Mermaid 图表"),n.innerHTML=e;const r=document.createElement("button");r.type="button",r.className="mdp-toggle",r.textContent="源码",r.setAttribute("aria-pressed","false"),r.addEventListener("click",()=>{const s=t.style.display==="none";t.style.display=s?"":"none",r.setAttribute("aria-pressed",s?"false":"true")}),t.before(n),t.before(r),t.style.display="none"}const F={id:"mermaid",test(t){const e=A(t);return e!==null&&P(e)},async enhance(t,e){const n=A(t);if(n===null||e.stateOf(t)==="rendered")return;const r=n.textContent??"",s=r===""?0:r.split(`
`).length;if(r.length>y||s>b){e.degrade(t,`源码过大（${r.length} 字符 / ${s} 行，上限 ${y} / ${b}）`);return}let i;try{if(i=H(await O(z)),i===null)throw new Error("运行时模块形态不符（缺少 initialize/render）");j(i)}catch(f){e.degrade(t,`图表引擎加载失败（${v(f)}）`);return}const o=`mdp-mermaid-${U+=1}`;let u;try{u=(await i.render(o,r)).svg}catch(f){e.degrade(t,v(f));return}!t.isConnected||(n.textContent??"")!==r||(e.stateOf(t)==="degraded"&&t.removeAttribute(c),B(t,u),e.mark(t,"rendered"))}},x="mdp/styles",W=`
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
`;function Y(t=document){if(t.getElementById(x)!==null)return;const e=t.createElement("style");e.id=x,e.textContent=W,t.head.append(e)}const M=_,h=[F];let l=null;function m(t=h){return l!==null?l:typeof document>"u"?(l={scan:()=>{},stop:()=>{},modules:t},l):(Y(),l=L(t),l)}function g(){I(),l=null}const X={boot:m,stop:g};m();const Z={clientName:M,boot:m,stop:g,defaultModules:h};return a.__test=X,a.boot=m,a.clientName=M,a.default=Z,a.defaultModules=h,a.stop=g,Object.defineProperties(a,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}}),a})({});
