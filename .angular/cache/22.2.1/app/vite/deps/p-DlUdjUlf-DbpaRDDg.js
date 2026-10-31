import { f as d$1 } from "./p-BriaEJK8-DcZRcXFi.js";
import { t as d$2 } from "./p-ZjP4CjeZ-BnW-oeAv.js";
//#region node_modules/@ionic/core/components/p-Dojwmvde.js
/*!
* (C) Ionic http://ionicframework.com - MIT License
*/
var r$1 = (r) => {
	for (let t = r; t; t = t.parentElement) {
		const r = t.getAttribute("dir")?.toLowerCase();
		if ("rtl" === r) return !0;
		if ("ltr" === r) return !1;
	}
	return "rtl" === document?.dir?.toLowerCase();
};
//#endregion
//#region node_modules/@ionic/core/components/p-DlUdjUlf.js
/*!
* (C) Ionic http://ionicframework.com - MIT License
*/
var r = (a, i = 0) => new Promise(((e) => {
	t(a, i, e);
}));
var t = (a, i = 0, e) => {
	let r, t;
	const n = { passive: !0 }, o = () => {
		r && r();
	}, s = (i) => {
		void 0 !== i && a !== i.target || (o(), e(i));
	};
	return a && (a.addEventListener("webkitTransitionEnd", s, n), a.addEventListener("transitionend", s, n), t = setTimeout(s, i + 500), r = () => {
		void 0 !== t && (clearTimeout(t), t = void 0), a.removeEventListener("webkitTransitionEnd", s, n), a.removeEventListener("transitionend", s, n);
	}), o;
};
var n = (a, i) => {
	a.componentOnReady ? a.componentOnReady().then(((a) => i(a))) : f((() => i(a)));
};
var o = (a) => void 0 !== a.componentOnReady;
var s = (a, i = []) => {
	const e = {};
	return i.forEach(((i) => {
		a.hasAttribute(i) && (null !== a.getAttribute(i) && (e[i] = a.getAttribute(i)), a.removeAttribute(i));
	})), e;
};
var l = [
	"role",
	"aria-activedescendant",
	"aria-atomic",
	"aria-autocomplete",
	"aria-braillelabel",
	"aria-brailleroledescription",
	"aria-busy",
	"aria-checked",
	"aria-colcount",
	"aria-colindex",
	"aria-colindextext",
	"aria-colspan",
	"aria-controls",
	"aria-current",
	"aria-describedby",
	"aria-description",
	"aria-details",
	"aria-disabled",
	"aria-errormessage",
	"aria-expanded",
	"aria-flowto",
	"aria-haspopup",
	"aria-hidden",
	"aria-invalid",
	"aria-keyshortcuts",
	"aria-label",
	"aria-labelledby",
	"aria-level",
	"aria-live",
	"aria-multiline",
	"aria-multiselectable",
	"aria-orientation",
	"aria-owns",
	"aria-placeholder",
	"aria-posinset",
	"aria-pressed",
	"aria-readonly",
	"aria-relevant",
	"aria-required",
	"aria-roledescription",
	"aria-rowcount",
	"aria-rowindex",
	"aria-rowindextext",
	"aria-rowspan",
	"aria-selected",
	"aria-setsize",
	"aria-sort",
	"aria-valuemax",
	"aria-valuemin",
	"aria-valuenow",
	"aria-valuetext"
];
var u = (a) => s(a, l);
var d = (a, i, e, r) => a.addEventListener(i, e, r);
var c = (a, i, e, r) => a.removeEventListener(i, e, r);
var p = (i, e, r, t) => {
	const n = d$2?.document;
	if (!n || !i || "undefined" == typeof ResizeObserver) return () => {};
	const o = n.createElement("div");
	o.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;width:0;height:var(${e},0px);`, i.appendChild(o);
	let s = t;
	const l = new ResizeObserver(((a) => {
		const { height: i } = a[0].contentRect;
		void 0 !== s && i !== s && r(i), s = i;
	}));
	return l.observe(o), () => {
		l.disconnect(), o.remove();
	};
};
var m = (a, i = a) => a.shadowRoot || i;
var f = (a) => "function" == typeof __zone_symbol__requestAnimationFrame ? __zone_symbol__requestAnimationFrame(a) : "function" == typeof requestAnimationFrame ? requestAnimationFrame(a) : setTimeout(a);
var v = (a) => !!a.shadowRoot && !!a.attachShadow;
var b = (a) => {
	if (a.focus(), a.classList.contains("ion-focusable")) {
		const i = a.closest("ion-app");
		i && i.setFocus([a]);
	}
};
var w = (a, i, e, r, t) => {
	{
		let a = i.querySelector("input.aux-input");
		a || (a = i.ownerDocument.createElement("input"), a.type = "hidden", a.classList.add("aux-input"), i.appendChild(a)), a.disabled = t, a.name = e, a.value = r || "";
	}
};
var h = (a, i, e) => Math.max(a, Math.min(i, e));
var x = (a, e) => {
	if (!a) {
		const a = "ASSERT: " + e;
		throw d$1(a), new Error(a);
	}
};
var y = (a) => {
	if (a) {
		const i = a.changedTouches;
		if (i && i.length > 0) {
			const a = i[0];
			return {
				x: a.clientX,
				y: a.clientY
			};
		}
		if (void 0 !== a.pageX) return {
			x: a.pageX,
			y: a.pageY
		};
	}
	return {
		x: 0,
		y: 0
	};
};
var _ = (a, i) => {
	const r = r$1(i);
	switch (a) {
		case "start": return r;
		case "end": return !r;
		default: throw new Error(`"${a}" is not a valid value for [side]. Use "start" or "end" instead.`);
	}
};
var j = (a, i) => {
	const e = a._original || a;
	return {
		_original: a,
		emit: T(e.emit.bind(e), i)
	};
};
var T = (a, i = 0) => {
	let e;
	return (...r) => {
		clearTimeout(e), e = setTimeout(a, i, ...r);
	};
};
var q = (a, i) => {
	if (a ??= {}, i ??= {}, a === i) return !0;
	const e = Object.keys(a);
	if (e.length !== Object.keys(i).length) return !1;
	for (const r of e) {
		if (!(r in i)) return !1;
		if (a[r] !== i[r]) return !1;
	}
	return !0;
};
var E = (a) => "number" == typeof a && !isNaN(a) && isFinite(a);
//#endregion
export { r$1 as S, u as _, d as a, x as b, j as c, n as d, o as f, s as g, r as h, c as i, l, q as m, _ as n, f as o, p, b as r, h as s, E as t, m as u, v, y as x, w as y };
