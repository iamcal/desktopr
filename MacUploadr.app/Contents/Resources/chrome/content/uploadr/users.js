/*
 * Flickr Uploadr
 *
 * Copyright (c) 2007-2008 Yahoo! Inc.  All rights reserved.  This library is
 * free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License (GPL), version 2 only.  This library is
 * distributed WITHOUT ANY WARRANTY, whether express or implied. See the GNU
 * GPL for more details (http://www.gnu.org/licenses/gpl.html)
 */

var users = {

	// Placeholders for current user info
	//   These are especially convenient for the API callbacks
	//   For bandwidth and sets, -1 indicates an unlimited amount remains
	frob: null,
	username: null,
	nsid: null,
	token: null,
	is_pro: null,
	bandwidth: null,
	filesize: null,
	videosize: null,
	sets: null,

	// List of authorized users
	list: {},

	// Shortcut for the auth sequence
	login: function(fresh) {
		buttons.login.disable();
		buttons.upload.enable();
		status.set(locale.getString('status.login'));

		// If we have a token already, use it
		if (users.token) {
			var t = users.token;
			users.token = null;
			wrap.auth.checkToken(t);
		}

		// If we don't have a token and we're not forcing a fresh token
		else if (!fresh) {

			// Try to find one
			for each (var u in users.list) {
				if (u.current) {
					users.username = u.username;
					users.nsid = u.nsid;
					users.token = u.token;
					users.is_pro = u.is_pro;
					users.bandwidth = u.bandwidth;
					users.filesize = u.filesize;
					users.videosize = u.videosize;
					users.sets = u.sets;
					break;
				}
			}
			if (users.token) {
				wrap.auth.checkToken(users.token);
			}

			// If we still don't have one, go get a frob
			else {
				wrap.auth.getFrob(fresh);
			}

		}

		// If we really want a fresh token, go get one
		else {
			wrap.auth.getFrob(fresh);
		}

	},
	_login: function() {
		if (users.nsid) {
			users.update();
			settings.load();

			// User specific API calls that must be made (and havent already been)
			wrap.people.getInfo(users.token, users.nsid);
			wrap.people.getUploadStatus(users.token);
			wrap.photosets.getList(users.token, users.nsid);

			// Update the UI
			/*
			document.getElementById('username').firstChild.nodeValue =
				locale.getFormattedString('username', [users.username]) + '  ';
			document.getElementById('switch').style.display = 'inline';
			document.getElementById('login').style.display = 'none';
			buttons.upload.enable();
			status.set(locale.getString('status.ready'));
			meta.login();
			*/

			// Check the command line
			clh(false);

			// Login is not *really* finished yet because API calls haven't
			// returned but do extension stuff anyway
			extension.after_login.exec(users.list[users.nsid]);

		} else {
			users.logout(false);
		}
	},

	// Logout
	logout: function(save) {
		if (save) {
			settings.save();
		}
		users.frob = null;
		users.username = null;
		users.nsid = null;
		users.token = null;
		users.is_pro = null;
		users.bandwidth = null;
		users.filesize = null;
		users.videosize = null;
		users.sets = null;

		// Update the UI
		/*
		document.getElementById('username').firstChild.nodeValue =
			locale.getString('notloggedin') + '  ';
		document.getElementById('switch').style.display = 'none';
		document.getElementById('login').style.display = 'block';
		buttons.upload.disable();
		document.getElementById('bw_remaining').style.display = 'none';
		status.set(locale.getString('status.disconnected'));
		meta.logout();
		document.getElementById('buddyicon').src =
			'http://flickr.com/images/buddyicon.jpg';
		document.getElementById('photostream_pro').style.display = 'none';
		*/
		photos.call_swf('logged_in', [null]);

	},

	// Update the app for the newly logged in user
	update: function() {
		if (null == users.nsid) {
			return;
		}

		// Add the user to the list or update a user already in the list
		for each (var u in users.list) {
			u.current = false;
		}
		if (users.list[users.nsid]) {
			var u = users.list[users.nsid];
			u.token = users.token;
			u.is_pro = users.is_pro;
			u.bandwidth = users.bandwidth;
			u.filesize = users.filesize;
			u.videosize = users.videosize;
			u.sets = users.sets;
			u.current = true;
		} else {
			users.list[users.nsid] = new User(users.username, users.nsid,
				users.token, users.is_pro, users.bandwidth, users.filesize,
				users.videosize, users.sets);
		}
		
		photos.call_swf("logged_in", [users.list[users.nsid]]);

	},

	// Load users from a file
	load: function() {
		users.list = file.read('users.json');

		// Login as the current user
		for each (var u in users.list) {
			if (u.current) {
				users.token = u.token;
				users.login();
				break;
			}
		}
		
		/*
		if(users.nsid){
			photos.call_swf("logged_in", users.list[users.nsid]);
		}
		*/

		// Force the bandwidth meter and command line handler if there's
		// no one logged in
		if (!users.token) {
			ui.users_updated();
			clh(true);
		}

	},

	// Save users to a file
	save: function() {
		file.write('users.json', users.list);
	},
	      
	current_user:function(){
		if(!users.nsid)
			return null
		else
			return users.list[users.nsid];
        }

};

// A user encapsulated
var User = function(username, nsid, token, is_pro, bw, filesize, videosize,
	sets) {
	this.username = username;
	this.nsid = nsid;
	this.token = token;
	this.is_pro = is_pro;
	this.bandwidth = bw;
	this.filesize = filesize;
	this.videosize = videosize;
	this.sets = sets;
	this.current = true;
	this.settings = {
		is_public: 1,
		is_friend: 0,
		is_family: 0,
		content_type: 1,
		hidden: 1,
		safety_level: 1,
		resize: -1
	};
	this.fresh = true;
};
