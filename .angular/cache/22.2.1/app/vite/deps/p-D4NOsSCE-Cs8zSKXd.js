import { n as o, t as d } from "./p-ZjP4CjeZ-BnW-oeAv.js";
import { a as d$1, d as n, i as c } from "./p-DlUdjUlf-DbpaRDDg.js";
import { c as l$1, o as h$1, t as a } from "./p-B8HBLiYi-C4-hENIE.js";
import { n as t, t as e } from "./p-BMPN55of-Bt4HbXz4.js";
//#region node_modules/@ionic/core/components/p-D4NOsSCE.js
/*!
* (C) Ionic http://ionicframework.com - MIT License
*/
var l = /* @__PURE__ */ new WeakMap();
var u = (o, t, n, i = 0, e = !1) => {
	l.has(o) !== n && (n ? f(o, t, i, e) : w(o, t));
};
var f = (o, t, n, i = !1) => {
	const e = t.parentNode, a = t.cloneNode(!1);
	a.classList.add("cloned-input"), a.tabIndex = -1, i && (a.disabled = !0);
	const r = "rtl" === o.ownerDocument.dir;
	a.style.insetInlineStart = r ? e.offsetWidth - t.offsetLeft - t.offsetWidth + "px" : `${t.offsetLeft}px`, e.appendChild(a), l.set(o, a);
	const s = r ? 9999 : -9999;
	o.style.pointerEvents = "none", t.style.transform = `translate3d(${s}px,${n}px,0) scale(0)`;
};
var w = (o, t) => {
	const n = l.get(o);
	n && (l.delete(o), n.remove()), o.style.pointerEvents = "", t.style.transform = "";
};
var p = "input, textarea, [no-blur], [contenteditable]";
var m = "$ionPaddingTimer";
var h = (o, t, n) => {
	const i = o[m];
	i && clearTimeout(i), t > 0 ? o.style.setProperty("--keyboard-offset", `${t}px`) : o[m] = setTimeout((() => {
		o.style.setProperty("--keyboard-offset", "0px"), n && n();
	}), 120);
};
var b = (o, t, n) => {
	o.addEventListener("focusout", (() => {
		t && h(t, 0, n);
	}), { once: !0 });
};
var y = 0;
var S = "data-ionic-skip-scroll-assist";
var D = (o) => {
	if (document.activeElement === o) return;
	const t = o.getAttribute("id"), n = o.closest(`label[for="${t}"]`), i = document.activeElement?.closest(`label[for="${t}"]`);
	null !== n && n === i || (o.setAttribute(S, "true"), o.focus());
};
var M = async (o, t, e, a$2, r, s, d = !1, c = 0, l = !0) => {
	if (!e && !a$2) return;
	const f = ((o, t, n, i) => ((o, t, n, i) => {
		const e = o.top, a = o.bottom, r = t.top, s = r + 15, d = Math.min(t.bottom, i - n) - 50 - a, c = s - e, l = Math.round(d < 0 ? -d : c > 0 ? -c : 0), u = Math.min(l, e - r);
		return {
			scrollAmount: u,
			scrollDuration: Math.min(400, Math.max(150, Math.abs(u) / .3)),
			scrollPadding: n,
			inputSafeY: 4 - (e - s)
		};
	})((o.closest("ion-item,[ion-item]") ?? o).getBoundingClientRect(), t.getBoundingClientRect(), n, i))(o, e || a$2, r, c);
	if (e && Math.abs(f.scrollAmount) < 4) return D(t), void (s && null !== e && (h(e, y), b(t, e, (() => y = 0))));
	if (u(o, t, !0, f.inputSafeY, d), D(t), s && e && (y = f.scrollPadding, h(e, y)), "undefined" != typeof window) {
		let a$1;
		const r = async () => {
			void 0 !== a$1 && clearTimeout(a$1), window.removeEventListener("ionKeyboardDidShow", d), window.removeEventListener("ionKeyboardDidShow", r), e && await h$1(e, 0, f.scrollAmount, f.scrollDuration), u(o, t, !1, f.inputSafeY), document.activeElement === t && D(t), s && b(t, e, (() => y = 0));
		}, d = () => {
			window.removeEventListener("ionKeyboardDidShow", d), window.addEventListener("ionKeyboardDidShow", r);
		};
		if (e) {
			const o = await a(e);
			if (l && f.scrollAmount > o.scrollHeight - o.clientHeight - o.scrollTop) return "password" === t.type ? (f.scrollAmount += 50, window.addEventListener("ionKeyboardDidShow", d)) : window.addEventListener("ionKeyboardDidShow", r), void (a$1 = setTimeout(r, 1e3));
		}
		r();
	}
};
var x = async (n$2, i) => {
	if (void 0 === o) return;
	const l = "ios" === i, f = "android" === i, w = n$2.getNumber("keyboardHeight", 290), m = n$2.getBoolean("scrollAssist", !0), h = n$2.getBoolean("hideCaretOnScroll", l), b = n$2.getBoolean("inputBlurring", !1), y = n$2.getBoolean("scrollPadding", !0), D = Array.from(o.querySelectorAll("ion-input, ion-textarea")), x = /* @__PURE__ */ new WeakMap(), K = /* @__PURE__ */ new WeakMap(), v = await e.getResizeMode(), j = async (t$2) => {
		await new Promise(((o) => n(t$2, o)));
		const n$1 = t$2.shadowRoot || t$2, i = n$1.querySelector("input") || n$1.querySelector("textarea"), c$1 = l$1(t$2), l = c$1 ? null : t$2.closest("ion-footer");
		if (i) {
			if (c$1 && h && !x.has(t$2)) {
				const o = ((o, t, n) => {
					if (!n || !t) return () => {};
					const i = (n) => {
						var i;
						(i = t) === i.getRootNode().activeElement && u(o, t, n);
					}, e = () => u(o, t, !1), s = () => i(!0), d = () => i(!1);
					return d$1(n, "ionScrollStart", s), d$1(n, "ionScrollEnd", d), t.addEventListener("blur", e), () => {
						c(n, "ionScrollStart", s), c(n, "ionScrollEnd", d), t.removeEventListener("blur", e);
					};
				})(t$2, i, c$1);
				x.set(t$2, o);
			}
			if ("date" !== i.type && "datetime-local" !== i.type && (c$1 || l) && m && !K.has(t$2)) {
				const n = ((t$1, n, i, e, a, r, s, c = !1) => {
					const l = r && (void 0 === s || s.mode === t.None);
					let u = !1;
					const f = void 0 !== d ? d.innerHeight : 0, w = (o) => {
						!1 !== u ? M(t$1, n, i, e, o.detail.keyboardHeight, l, c, f, !1) : u = !0;
					}, p = () => {
						u = !1, d?.removeEventListener("ionKeyboardDidShow", w), t$1.removeEventListener("focusout", p);
					}, m = async () => {
						n.hasAttribute(S) ? n.removeAttribute(S) : (M(t$1, n, i, e, a, l, c, f), d?.addEventListener("ionKeyboardDidShow", w), t$1.addEventListener("focusout", p));
					};
					return t$1.addEventListener("focusin", m), () => {
						t$1.removeEventListener("focusin", m), d?.removeEventListener("ionKeyboardDidShow", w), t$1.removeEventListener("focusout", p);
					};
				})(t$2, i, c$1, l, w, y, v, f);
				K.set(t$2, n);
			}
		}
	};
	b && (() => {
		let o = !0, t = !1;
		const n = document;
		d$1(n, "ionScrollStart", (() => {
			t = !0;
		})), n.addEventListener("focusin", (() => {
			o = !0;
		}), !0), n.addEventListener("touchend", ((i) => {
			if (t) return void (t = !1);
			const e = n.activeElement;
			if (!e) return;
			if (e.matches(p)) return;
			const a = i.target;
			a !== e && (a.matches(p) || a.closest(p) || (o = !1, setTimeout((() => {
				o || e.blur();
			}), 50)));
		}), !1);
	})();
	for (const o of D) j(o);
	o.addEventListener("ionInputDidLoad", ((o) => {
		j(o.detail);
	})), o.addEventListener("ionInputDidUnload", ((o) => {
		((o) => {
			if (h) {
				const t = x.get(o);
				t && t(), x.delete(o);
			}
			if (m) {
				const t = K.get(o);
				t && t(), K.delete(o);
			}
		})(o.detail);
	}));
};
//#endregion
export { x as startInputShims };
