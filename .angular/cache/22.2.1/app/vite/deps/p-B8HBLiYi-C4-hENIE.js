import { m as h$1 } from "./p-BriaEJK8-DcZRcXFi.js";
import { d as n$1 } from "./p-DlUdjUlf-DbpaRDDg.js";
//#region node_modules/@ionic/core/components/p-B8HBLiYi.js
/*!
* (C) Ionic http://ionicframework.com - MIT License
*/
var r = "ion-content";
var e = ".ion-content-scroll-host";
var t = `${r}, ${e}`;
var n = (o) => "ION-CONTENT" === o.tagName;
var a = async (s) => n(s) ? (await new Promise(((r) => n$1(s, r))), s.getScrollElement()) : s;
var i = (o) => o.querySelector(".ion-content-scroll-host") || o.querySelector(t);
var l = (o) => o.closest(t);
var f = (o) => o.querySelector(e);
var u = (o) => {
	if (n(o)) return o.querySelector("ion-refresher");
	const s = o.closest(r);
	if (null === s) return null;
	const e = f(s);
	return null !== e && e.contains(o) ? s.querySelector("ion-refresher") : null;
};
var c = (o, s) => n(o) ? o.scrollToTop(s) : Promise.resolve(o.scrollTo({
	top: 0,
	left: 0,
	behavior: "smooth"
}));
var h = (o, s, r, e) => n(o) ? o.scrollByPoint(s, r, e) : Promise.resolve(o.scrollBy({
	top: r,
	left: s,
	behavior: e > 0 ? "smooth" : "auto"
}));
var m = (o) => h$1(o, r);
var p = (o) => {
	if (n(o)) {
		const s = o.scrollY;
		return o.scrollY = !1, s;
	}
	return o.style.setProperty("overflow", "hidden"), !0;
};
var d = (o, s) => {
	n(o) ? o.scrollY = s : o.style.removeProperty("overflow");
};
//#endregion
export { f as a, l as c, p as d, r as f, e as i, m as l, c as n, h as o, u as p, d as r, i as s, a as t, n as u };
