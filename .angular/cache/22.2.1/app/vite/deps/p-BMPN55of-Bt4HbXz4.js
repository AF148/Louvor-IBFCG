import { t as d } from "./p-ZjP4CjeZ-BnW-oeAv.js";
//#region node_modules/@ionic/core/components/p-CIGNaXM1.js
/*!
* (C) Ionic http://ionicframework.com - MIT License
*/
var r = () => {
	if (void 0 !== d) return d.Capacitor;
};
//#endregion
//#region node_modules/@ionic/core/components/p-BMPN55of.js
/*!
* (C) Ionic http://ionicframework.com - MIT License
*/
var n;
var t;
(function(o) {
	o.Unimplemented = "UNIMPLEMENTED", o.Unavailable = "UNAVAILABLE";
})(n || (n = {})), function(o) {
	o.Body = "body", o.Ionic = "ionic", o.Native = "native", o.None = "none";
}(t || (t = {}));
var e = {
	getEngine() {
		const n = r();
		if (n?.isPluginAvailable("Keyboard")) return n.Plugins.Keyboard;
	},
	getResizeMode() {
		const o = this.getEngine();
		return o?.getResizeMode ? o.getResizeMode().catch(((o) => {
			if (o.code !== n.Unimplemented) throw o;
		})) : Promise.resolve(void 0);
	}
};
//#endregion
export { t as n, r, e as t };
