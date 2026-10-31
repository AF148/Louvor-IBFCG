import { n as o$1 } from "./p-ZjP4CjeZ-BnW-oeAv.js";
import { x as y } from "./p-DlUdjUlf-DbpaRDDg.js";
//#region node_modules/@ionic/core/components/p-C_NQIzjP.js
/*!
* (C) Ionic http://ionicframework.com - MIT License
*/
var o = (o) => {
	if (void 0 === o$1) return;
	let s, l, p, u = 0;
	const d = o.getBoolean("animated", !0) && o.getBoolean("rippleEffect", !0), v = /* @__PURE__ */ new WeakMap(), m = () => {
		p && clearTimeout(p), p = void 0, s && (b(!1), s = void 0);
	}, j = (t, o) => {
		if (t && t === s) return;
		p && clearTimeout(p), p = void 0;
		const { x: i, y: r } = y(o);
		if (s) {
			if (v.has(s)) throw new Error("internal error");
			s.classList.contains(a) || w(s, i, r), b(!0);
		}
		if (t) {
			const e = v.get(t);
			e && (clearTimeout(e), v.delete(t)), t.classList.remove(a);
			const o = () => {
				w(t, i, r), p = void 0;
			};
			n(t) ? o() : p = setTimeout(o, c);
		}
		s = t;
	}, w = (t, e, o) => {
		if (u = Date.now(), t.classList.add(a), !d) return;
		const i = r(t);
		null !== i && (T(), l = i.addRipple(e, o));
	}, T = () => {
		void 0 !== l && (l.then(((t) => t())), l = void 0);
	}, b = (t) => {
		T();
		const e = s;
		if (!e) return;
		const o = f - Date.now() + u;
		if (t && o > 0 && !n(e)) {
			const t = setTimeout((() => {
				e.classList.remove(a), v.delete(e);
			}), f);
			v.set(e, t);
		} else e.classList.remove(a);
	};
	o$1.addEventListener("ionGestureCaptured", m), o$1.addEventListener("pointerdown", ((t) => {
		s || 2 === t.button || j(i(t), t);
	}), !0), o$1.addEventListener("pointerup", ((t) => {
		j(void 0, t);
	}), !0), o$1.addEventListener("pointercancel", m, !0);
};
var i = (t) => {
	if (void 0 === t.composedPath) return t.target.closest(".ion-activatable");
	{
		const e = t.composedPath();
		for (let t = 0; t < e.length - 2; t++) {
			const o = e[t];
			if (!(o instanceof ShadowRoot) && o.classList.contains("ion-activatable")) return o;
		}
	}
};
var n = (t) => t.classList.contains("ion-activatable-instant");
var r = (t) => {
	if (t.shadowRoot) {
		const e = t.shadowRoot.querySelector("ion-ripple-effect");
		if (e) return e;
	}
	return t.querySelector("ion-ripple-effect");
};
var a = "ion-activated";
var c = 100;
var f = 150;
//#endregion
export { o as startTapClick };
