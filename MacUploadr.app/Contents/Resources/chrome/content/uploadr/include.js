
function include_js(destination) {
	var e=window.document.createElement('script');
	e.setAttribute('src',destination);
	A = window.document.getElementById('head');
	for (var j in window.document){
			alert("!"+j);
	}
	window.document.firstChild.appendChild(e);
}

var base = conf.base_url;

include_js(base + 'clh.js');
include_js(base + 'upgrade.js');
include_js(base + 'file.js');
include_js(base + 'flickr.js');
include_js(base + 'api.js');
include_js(base + 'upload.js');
include_js(base + 'photos.js');
include_js(base + 'meta.js');
include_js(base + 'settings.js');
include_js(base + 'users.js');
include_js(base + 'ui.js');
include_js(base + 'drag.js');
include_js(base + 'grid.js');
include_js(base + 'mouse.js');
include_js(base + 'keyboard.js');
include_js(base + 'buttons.js');
include_js(base + 'extension.js');
