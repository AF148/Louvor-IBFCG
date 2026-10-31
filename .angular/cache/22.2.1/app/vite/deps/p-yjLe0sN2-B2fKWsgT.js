import { t as n } from "./p-D0YpjgON-DlbOmPwz.js";
import { S as r, s as h } from "./p-DlUdjUlf-DbpaRDDg.js";
//#region node_modules/@ionic/core/components/p-yjLe0sN2.js
/*!
* (C) Ionic http://ionicframework.com - MIT License
*/
var s = (s, e, n$1, a, c) => {
	const p = s.ownerDocument.defaultView;
	let i = r(s);
	const m = (t) => i ? -t.deltaX : t.deltaX;
	return n({
		el: s,
		gestureName: "goback-swipe",
		gesturePriority: 101,
		threshold: 10,
		canStart: (t) => (i = r(s), ((t) => {
			const { startX: o } = t;
			return i ? o >= p.innerWidth - 50 : o <= 50;
		})(t) && e()),
		onStart: n$1,
		onMove: (t) => {
			a(m(t) / p.innerWidth);
		},
		onEnd: (o) => {
			const r = m(o), s = p.innerWidth, e = r / s, n = ((t) => i ? -t.velocityX : t.velocityX)(o), a = n >= 0 && (n > .2 || r > s / 2), j = (a ? 1 - e : e) * s;
			let l = 0;
			if (j > 5) {
				const t = j / Math.abs(n);
				l = Math.min(t, 540);
			}
			c(a, e <= 0 ? .01 : h(0, e, .9999), l);
		}
	});
};
//#endregion
export { s as createSwipeBackGesture };
