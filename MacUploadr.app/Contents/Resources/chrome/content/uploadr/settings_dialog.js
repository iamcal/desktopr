/*
 * Flickr Uploadr
 *
 * Copyright (c) 2007-2008 Yahoo! Inc.  All rights reserved.  This library is
 * free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License (GPL), version 2 only.  This library is
 * distributed WITHOUT ANY WARRANTY, whether express or implied. See the GNU
 * GPL for more details (http://www.gnu.org/licenses/gpl.html)
 */

var settings = {

	nsid: window.arguments[0],
	list: window.arguments[1],

	load: function() {

		// Show a login message for non-logged-in users
		if (null == settings.nsid) {
			document.getElementById('dialog_settings').style.width = '300px';
			document.getElementById('notloggedin').style.display = '-moz-box';
			document.getElementById('loggedin').style.display = 'none';
		}

		// Show everything for logged in users
		else {
			document.getElementById('notloggedin').style.display = 'none';
			document.getElementById('loggedin').style.display = '-moz-box';

			// Setup the default state of the UI
			var dropdown = document.getElementById('user');
			dropdown.removeAllItems();
			var u = settings.list;
			var i = 0;
			for each (var user in u) {
				dropdown.appendItem(user.username, user.nsid);
				if (user.current) {
					dropdown.selectedIndex = i;
					settings._load(user.nsid);
				}
				++i;
			}
			document.getElementById('resize_prompt').firstChild.nodeValue = window.arguments[2];

		}

		moveToAlertPosition();
	},

	// Load a user's data
	_load: function(nsid) {
		var s = settings.list[nsid].settings;
		document.getElementById('is_public').value = s.is_public;
		document.getElementById('is_friend').checked = 1 == s.is_friend;
		document.getElementById('is_family').checked = 1 == s.is_family;
		settings.is_public(s.is_public);
		document.getElementById('content_type').value = s.content_type;
		document.getElementById('hidden').checked = 2 == s.hidden;
		document.getElementById('safety_level').value = s.safety_level;
		document.getElementById('resize').value = s.resize;
	},

	cancel: function() {
	},

	ok: function() {
		window.arguments[3].ok = true;
	},

	// Change the active user
	change_user: function() {
		for each (var user in settings.list) {
			user.current = false;
		}
		var dropdown = document.getElementById('user');
		settings.nsid = dropdown.value;
		settings.list[settings.nsid].current = true;
		settings._load(settings.nsid);
	},

	// Remove a user from the list, which will be made permanent by pressing OK
	remove_user: function() {
		var dropdown = document.getElementById('user');
		delete settings.list[settings.nsid];
		dropdown.removeItemAt(dropdown.selectedIndex);
		dropdown.selectedIndex = 0;
		settings.nsid = dropdown.value ? dropdown.value : null;
		if (null != settings.nsid) {
			settings.list[settings.nsid].current = true;
			settings._load(settings.nsid);
		}
	},

	// Close this dialog to start the auth process for a new user, after which we'll return here
	add_user: function() {
		window.arguments[3].add_user = true;
		window.close();
	},

	// Copy form data back into storage whenever things are changed
	is_public: function(value) {
		settings.list[settings.nsid].settings.is_public = parseInt(value);
		if (1 == parseInt(value)) {
			document.getElementById('is_friend').checked = false;
			document.getElementById('is_family').checked = false;
			document.getElementById('is_friend').disabled = true;
			document.getElementById('is_family').disabled = true;
		} else {
			document.getElementById('is_friend').disabled = false;
			document.getElementById('is_family').disabled = false;
		}
	},
	is_friend: function(checked) {
		settings.list[settings.nsid].settings.is_friend = checked ? 1 : 0;
	},
	is_family: function(checked) {
		settings.list[settings.nsid].settings.is_family = checked ? 1 : 0;
	},
	hidden: function(checked) {
		settings.list[settings.nsid].settings.hidden = checked ? 2 : 1;
	},
	safety_level: function(value) {
		settings.list[settings.nsid].settings.safety_level = parseInt(value);
	},
	content_type: function(value) {
		settings.list[settings.nsid].settings.content_type = parseInt(value);
	},
	resize: function(value) {
		settings.list[settings.nsid].settings.resize = parseInt(value);
	},
	base_url: function(value){
		settings.list[settings.nsid].settings.base_url = value;
  	},
	config_proxy: function(){
		window.openDialog('chrome://uploadr/content/proxy.xul', 'dialog_proxy', 'chrome,titlebar,toolbar,centerscreen,modal');
	}
};
