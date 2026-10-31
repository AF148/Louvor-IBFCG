//#region node_modules/ionicons/dist/esm/index-BdioGpgU.js
/*!__STENCIL_STATIC_IMPORT_SWITCH__*/
var plt = {
	$flags$: 0,
	$resourcesUrl$: "",
	jmp: (h2) => h2(),
	raf: (h2) => requestAnimationFrame(h2),
	ael: (el, eventName, listener, opts) => el.addEventListener(eventName, listener, opts),
	rel: (el, eventName, listener, opts) => el.removeEventListener(eventName, listener, opts),
	ce: (eventName, opts) => new CustomEvent(eventName, opts)
};
var setAssetPath = (path) => plt.$resourcesUrl$ = path;
//#endregion
//#region node_modules/ionicons/dist/esm/index-yPdEV4yx.js
var CACHED_MAP;
var getIconMap = () => {
	if (typeof window === "undefined") return /* @__PURE__ */ new Map();
	else {
		if (!CACHED_MAP) {
			const win = window;
			win.Ionicons = win.Ionicons || {};
			CACHED_MAP = win.Ionicons.map = win.Ionicons.map || /* @__PURE__ */ new Map();
		}
		return CACHED_MAP;
	}
};
var addIcons = (icons) => {
	Object.keys(icons).forEach((name) => {
		addToIconMap(name, icons[name]);
		/**
		* Developers can also pass in the SVG object directly
		* and Ionicons can map the object to a kebab case name.
		* Example: addIcons({ addCircleOutline });
		* This will create an "addCircleOutline" entry and
		* an "add-circle-outline" entry.
		* Usage: <ion-icon name="add-circle-outline"></ion-icon>
		* Using name="addCircleOutline" is valid too, but the
		* kebab case naming is preferred.
		*/
		const toKebabCase = name.replace(/([a-z0-9]|(?=[A-Z]))([A-Z0-9])/g, "$1-$2").toLowerCase();
		if (name !== toKebabCase) addToIconMap(toKebabCase, icons[name]);
	});
};
var addToIconMap = (name, data) => {
	const map = getIconMap();
	const existingIcon = map.get(name);
	if (existingIcon === void 0) map.set(name, data);
	else if (existingIcon !== data) console.warn(`[Ionicons Warning]: Multiple icons were mapped to name "${name}". Ensure that multiple icons are not mapped to the same icon name.`);
};
//#endregion
export { addIcons, setAssetPath };
