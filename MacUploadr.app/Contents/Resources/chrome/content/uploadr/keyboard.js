/*
 * Flickr Uploadr
 *
 * Copyright (c) 2007-2008 Yahoo! Inc.  All rights reserved.  This library is
 * free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License (GPL), version 2 only.  This library is
 * distributed WITHOUT ANY WARRANTY, whether express or implied. See the GNU
 * GPL for more details (http://www.gnu.org/licenses/gpl.html)
 */

var keyboard = {

	// Reference to the currently focused text field
	_select_all: null,

	// Toggle which select all behavior will happen
	select_all_text: function(ref) {
		keyboard._select_all = ref;
		document.getElementById('menu_cut').disabled = false;
		document.getElementById('menu_copy').disabled = false;
		document.getElementById('menu_paste').disabled = false;
	},
	select_all_photos: function() {
		keyboard._select_all = null;
		document.getElementById('menu_cut').disabled = true;
		document.getElementById('menu_copy').disabled = true;
		document.getElementById('menu_paste').disabled = true;
	},

	// Select all photos or all text
	select_all: function() {
		if (null == keyboard._select_all) {
			if (0 == photos.count) {
				return;
			}
			photos.selected = [];
			var list = document.getElementById('photos_list').getElementsByTagName('li');
			var ii = list.length;
			for (var i = 0; i < ii; ++i) {
				var img = list[i].getElementsByTagName('img')[0];
				if ('error' != img.className && 'loading' != img.className) {
					img.className = 'selected';
					photos.selected.push(parseInt(list[i].id.replace('photo', '')));
				}
			}
			meta.batch();
		} else {
			keyboard._select_all.select();
		}
	},

	// Events for pressed arrow keys
	arrows: {

		up: function(e) {
			keyboard.arrows._arrow(e, grid.width());
		},

		right: function(e) {
			keyboard.arrows._arrow(e, -1);
		},

		down: function(e) {
			keyboard.arrows._arrow(e, -grid.width());
		},

		left: function(e) {
			keyboard.arrows._arrow(e, 1);
		},

		// Abstract away the actual arrow key actions
		_arrow: function(e, inc) {
			if ('photos' != pages.current() || null == photos.last) {
				return;
			}
			var i = photos.last + inc;
			var next = photos.list[i];
			i = photos.last + inc;
			var ii = photos.list.length;
			while (null == next && i >= 0 && i < ii) {
				next = photos.list[i];
				i = photos.last + inc;
			}
			if (null != next) {
				var img = document.getElementById('photo' + next.id).getElementsByTagName('img')[0];
				mouse.click({
					target: img,
					shiftKey: e.shiftKey,
					ctrlKey: e.ctrlKey,
					metaKey: e.metaKey
				});
				img.scrollIntoView(inc > 0);
			}
		}

	}

};