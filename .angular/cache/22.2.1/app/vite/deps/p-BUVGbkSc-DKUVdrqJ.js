import { n as J, x as z } from "./p-BriaEJK8-DcZRcXFi.js";
import { d as n } from "./p-DlUdjUlf-DbpaRDDg.js";
import { c as l, n as c } from "./p-B8HBLiYi-C4-hENIE.js";
//#region node_modules/@ionic/core/components/p-BUVGbkSc.js
/*!
* (C) Ionic http://ionicframework.com - MIT License
*/
var i = () => {
	const i = window;
	i.addEventListener("statusTap", (() => {
		z((() => {
			const o = document.elementFromPoint(i.innerWidth / 2, i.innerHeight / 2);
			if (!o) return;
			const n$1 = l(o);
			n$1 && new Promise(((o) => n(n$1, o))).then((() => {
				J((async () => {
					n$1.style.setProperty("--overflow", "hidden"), await c(n$1, 300), n$1.style.removeProperty("--overflow");
				}));
			}));
		}));
	}));
};
//#endregion
export { i as startStatusTap };
