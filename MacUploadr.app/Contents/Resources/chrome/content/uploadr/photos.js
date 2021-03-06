/*
 * Flickr Uploadr
 *
 * Copyright (c) 2007-2008 Yahoo! Inc.  All rights reserved.  This library is
 * free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License (GPL), version 2 only.  This library is
 * distributed WITHOUT ANY WARRANTY, whether express or implied. See the GNU
 * GPL for more details (http://www.gnu.org/licenses/gpl.html)
 */


var photos = {

	// Storage
	list: [],
	count: 0,
	the_swf:null,
	file:null,
	to_send_to_flash:[],
	to_add_files:[],
	errors: 0,
	selected: [],
	last: null,
	sort: true,
	batch_size: 0,
	calling_swf: false,
	to_call_swf: [],
	wait_time: 2000,
	thumb_queue: [],
	thumb_thread_counter: 0,
	waiting_to_thumb: 0,
	waiting_on_thumb: {},
	indexed_paths: {},
	indexed_contents: {},
	added_paths: {},
	indexed_dirs: {},
	flash: {},
	thumb_cancel: false,

	// Upload tracking
	uploading: [],
	uploaded: [],
	//add_to_set: [],
	failed: [],
	sets: {},
	
	to_add: [],
	
	ok: 0,
	fail: 0,
	sets_fail: false,
	sets_out: 0,
	kb: {
		sent: 0,
		total: 0
	},

	// Queue batches of photos
	ready: [],
	ready_size: [],

	
	call_swf: function(func_name, args){
		if(!photos.calling_swf){
			photos.calling_swf = true;
			if(!photos.the_swf){
				photos.the_swf = document.getElementById('the_swf');
			}
			var f = photos.the_swf[func_name];
			var R;
			if(f){
				R = f.apply(photos.the_swf, args);
			}
			else
				Components.utils.reportError(String("could not find swf function " + func_name));
				//photos.alert("could not find swf function " + func_name);
			photos.calling_swf = false;
			return R;
		}
		else{
			photos.to_call_swf.push([func_name, args]);
		}
	},
	
	get_big_file: function(id){
		threads.priorityPool.dispatch(new Thumb(id, 800, photos.list[id].path),
		    threads.priorityPool.DISPATCH_NORMAL);
        },
		     
	index_some_photos: function(){
		   //photos.alert('start..');
		threads.indexer.dispatch(new IndexDrive(), threads.worker.DISPATCH_NORMAL);
	},
	      
	// Let the user select some files, thumbnail them and track them
	//   Patch for saving our place in the directory structure from
	//   Zoolcar9 at http://pastebin.mozilla.org/279359
	add_dialog: function() {
		buttons.upload.disable();

		// Find a good default directory for the file picker
		var path = nsPreferences.getLocalizedUnicharPref(
			'flickr.add_directory', '');
		if ('' == path) {
			path = Cc['@mozilla.org/file/directory_service;1']
				.getService(Ci.nsIProperties).get('ProfD', Ci.nsIFile).path;
			if (path.match(/^\//)) {
				path += '/../../../../../Pictures';
			} else {
				path += '\\..\\..\\..\\..\\..\\My Documents\\My Pictures';
			}
		}
		var def = Cc['@mozilla.org/file/local;1']
			.createInstance(Ci.nsILocalFile);
		def.initWithPath(path);

		// Open the file picker
		var fp = Cc['@mozilla.org/filepicker;1']
			.createInstance(Ci.nsIFilePicker);
		fp.init(window, locale.getString('dialog.add'),
			Ci.nsIFilePicker.modeOpenMultiple);
		var can_has_video = 'object' == typeof users.is_pro || users.is_pro;
		if (can_has_video) {
			fp.appendFilter('Photos and Videos', '*.jpeg; *.JPEG; *.jpg; ' +
				'*.JPG; *.gif; *.GIF; *.png; *.PNG; *.tiff; *.TIFF; *.tif; ' +
				'*.TIF; *.bmp; *.BMP; *.mp4; *.MP4; *.mpeg; *.MPEG; *.mpg; ' +
				'*.MPG; *.avi; *.AVI; *.wmv; *.WMV; *.mov; *.MOV; *.dv; ' +
				'*.DV; *.3gp; *.3GP; *.m4v; *.M4V');
		}
		fp.appendFilter('Photos', '*.jpeg; *.JPEG; *.jpg; *.JPG; *.gif; ' +
			'*.GIF; *.png; *.PNG; *.tiff; *.TIFF; *.tif; *.TIF; *.bmp; *.BMP');
		if (can_has_video) {
			fp.appendFilter('Videos', '*.mp4; *.MP4; *.mpeg; *.MPEG; ' +
				'*.mpg; *.MPG; *.avi; *.AVI; *.wmv; *.WMV; *.mov; *.MOV; ' +
				'*.dv; *.DV; *.3gp; *.3GP; *.m4v; *.M4V');
		}
		fp.displayDirectory = def;
		var res = fp.show();
		if (Ci.nsIFilePicker.returnOK == res) {
			var files = fp.files;
			var paths = [];
			while (files.hasMoreElements()) {
				var arg = files.getNext().QueryInterface(Ci.nsILocalFile).path;
				arg = arg.replace(/\\/g, '\/');
				paths.unshift(arg);
			}
			photos.add(paths);

			// Save our place in the filesystem
			if (arg.match(/^\//)) {
				path = arg.replace(/\/[^\/]+$/, '').toString();
			} else {
			 	path = arg.replace(/\\[^\\]+$/, '').toString();
			}
			nsPreferences.setUnicharPref('flickr.add_directory', path);

		} else if (photos.count) {
			buttons.upload.enable();
		}
	},

	add_threaded: function(paths) {
		for(var i=0;i<paths.length;i++)
			threads.worker.dispatch(new PhotoAdd(paths[i]), threads.worker.DISPATCH_NORMAL);
	},
	
	// Add a list of photos
	add: function(paths, silent) {
		if (null == silent) { silent = false; }
		//buttons.upload.disable();

		// Tally up photos and videos and remove large videos
		var p_count = 0;
		var v_count = 0;
		var big_videos = [];
		var new_paths = [];
		var bad = [];
		for each (var p in paths) {
			var P = p;
			p = p[0];

			var path = 'object' == typeof p ? p.path : p;

			// Photos are always allowed
			if (photos.is_photo(path)) {
				++p_count;
				new_paths.push(P);
			}

			// Videos are allowed for now as long as they aren't too big
			else if (photos.is_video(path)) {
				++v_count;
				if (file.size(path) > (null == users.videosize
					? conf.videosize : users.videosize)) {
					var filename = path.match(/([^\/\\]*)$/);
					big_videos.push(null == filename ? path : filename[1]);
				} else {
					new_paths.push(P);
				}
			}
			// Warn about files that are being dropped
			//else if (path.length) {
				//var filename = path.match(/([^\/\\]*)$/);
				//bad.push(null == filename ? path : filename[1]);
			//}

		}
		paths = new_paths;

		// Yell about anything added that wasn't a photo or video
		if (bad.length) {
			var pl = (1 == bad.length ? 's' : 'p') +
				(0 == paths.length ? 'z' : 'p');
			var text;
			if (1 == bad.length) {
				text = locale.getFormattedString('bad.' + pl + '.text',
					[bad[0]]);
			} else {
				text = [locale.getFormattedString('bad.' + pl + '.text',
					[bad.length]), bad.join(', ')];
			}
			alert(text, locale.getString('bad.' + pl + '.title'),
				locale.getString('bad.' + pl + '.ok'));
		}

		// If we're allowed to bother the user
		if (!silent) {

			// Plurality strings are decided as follows
			//   Each dialog has identical strings but they're coded
			//   as follows for varied pluralities:
			//     XXX.sz.XXX: singular video, zero photos
			//     XXX.sz.XXX: plural videos, zero photos
			//     XXX.pp.XXX: singular video, plural photos
			//     XXX.pp.XXX: plural videos, plural photos

			// Warn if a video is larger than ? MB and remove offending
			// videos from the list
			if (big_videos.length) {

				// Plurality, see above
				var pl = (1 == v_count ? 's' : 'p') +
					(0 == p_count ? 'z' : 'p');

				window.openDialog(
					'chrome://uploadr/content/video_big.xul',
					'dialog_video_big', 'chrome,modal',
					locale.getString('video.add.big.' + pl + '.title'),
					locale.getFormattedString(
						'video.add.big.' + pl + '.explain',
						[(null == users.videosize
						? conf.videosize : users.videosize) >> 10]
					),
					1 == v_count ? '' : big_videos.join(', '),
					locale.getString('video.add.big.' + pl + '.ok'));
				v_count -= big_videos.length;
			}

			// If there are videos then there may be questions to ask
			if (v_count) {
				var result = {};

				// Redo plurality, see above
				var pl = (1 == v_count ? 's' : 'p') +
					(0 == p_count ? 'z' : 'p');

				// Offline users can have video but we should warn them that
				// we'll remove them without warning if they turn out to be
				// a free user at upload time
				if ('object' == typeof users.is_pro) {
					window.openDialog(
						'chrome://uploadr/content/video_offline.xul',
						'dialog_video_offline', 'chrome,modal',
						locale.getString('video.add.offline.' + pl + '.title'),
						locale.getString('video.add.offline.' + pl + '.explain'),
						locale.getString('video.add.offline.' + pl + '.ok'),
						locale.getString('video.add.offline.' + pl + '.cancel'),
						locale.getString('video.add.offline.' + pl + '.extra1'),
						result);
				}

				// Pro users can have videos but we still need to bother
				// those that have their defaults set to restricted
				else if (3 == settings.safety_level) {
					window.openDialog(
						'chrome://uploadr/content/video_restricted.xul',
						'dialog_video_restricted', 'chrome,modal',
						locale.getString('video.add.restricted.' + pl + '.title'),
						locale.getString('video.add.restricted.' + pl + '.explain'),
						locale.getString('video.add.restricted.' + pl + '.action'),
						locale.getString('video.add.restricted.' + pl + '.note'),
						locale.getString('video.add.restricted.' + pl + '.guidelines'),
						locale.getString('video.add.restricted.' + pl + '.ok'),
						locale.getString('video.add.restricted.' + pl + '.cancel'),
						locale.getString('video.add.restricted.' + pl + '.extra1'),
						result);
				}

				// Quit immediately if we're forgetting the whole group
				if ('extra1' == result.result) {
					return;
				}

				// Remove videos from the path list if we're keeping photos
				else if ('cancel' == result.result) {
					var new_paths = [];
					while (paths.length) {
						var p = paths.shift();
						P = p;
						p = p[0];

						var path = 'object' == typeof p ? p.path : p;
						if (!photos.is_video(path)) {
							new_paths.push(P);
						}
					}
					paths = new_paths;
				}

				// If we're adding videos, remember the safety level to set
				else if ('ok' == result.result && result.safety_level) {
					var ii = paths.length;
					for (var i = 0; i < ii; ++i) {
						var p = 'object' == typeof paths[i][0] ?
							paths[i][0].path : paths[i][0];
						if (photos.is_video(p)) {
							paths[i][0] = 'object' == typeof paths[i][0] ?
								paths[i][0] : {'path': p};
							paths[i][0].safety_level = result.safety_level;
						}
					}
				}

			}

		}

		// Now add whatever's left
		var ii = paths.length;
		var to_flash = [];
		block_normalize();
		var ext_list = [];
		//var currentPathsLists = photos.list.map(function(x) {return x.path;});
		
		for (var i = ii-1; i >= 0; --i) {
			var p = 'object' == typeof paths[i][0] ? paths[i][0].path : paths[i][0];

			// Resolve the path and add the photo
			if (/^file:\/\//.test(p)) {
				p = Cc['@mozilla.org/network/protocol;1?name=file']
					.getService(Ci.nsIFileProtocolHandler)
					.getFileFromURLSpec(p).path;
			
			}
			if(photos.added_paths[p]!=true) {
			    var P = photos._add(p, paths[i][1]);
			    ext_list.push(P);
			    to_flash.push([P,paths[i][1]]);

			    // Photos can be passed as an object which already has metadata
			    if ('object' == typeof paths[i][0]) {
				    for (var k in paths[i][0]) {
					    if ('id' == k) { continue; }
					    photos.list[photos.list.length - 1][k] = paths[i][0][k];
				    }
			    }
		    }
		}
		
		
		photos.call_swf('add_files', [to_flash]);
		
		//if(photos.thumb_thread_counter < 1){
		for(var i=0;i<to_flash.length;i++){
			threads.workerPool.dispatch(new Thumb(to_flash[i][0].id, conf.thumb_size, to_flash[i][0].path),
			   threads.workerPool.DISPATCH_NORMAL);
		}
		//}
		/*
		else{
			photos.thumb_queue.push([id,path]);
		}
		*/

		// Do extension stuff after we've added all of the photos but
		// before the list we've saved potentially becomes invalid
		//extension.after_add.exec(ext_list);

		// Update the UI
		/*
		photos.normalize();
		if (photos.count + photos.errors) {
		    document.getElementById('t_clear').className = 'button';
			if (photos.sort) {
				threads.worker.dispatch(new Sort(),
					threads.worker.DISPATCH_NORMAL);
				document.getElementById('photos_sort_default')
					.style.display = 'block';
				document.getElementById('photos_sort_revert')
					.style.display = 'none';
			} else {
				threads.worker.dispatch(new EnableUpload(),
					threads.worker.DISPATCH_NORMAL);
				document.getElementById('photos_sort_default')
					.style.display = 'none';
				document.getElementById('photos_sort_revert')
					.style.display = 'block';
			}
			document.getElementById('photos_init')
				.style.display = 'none';
			document.getElementById('photos_new')
				.style.display = 'none';
			document.getElementById('no_meta_prompt')
				.style.visibility = 'visible';
			mouse.show_photos();
		} else {
			unblock_normalize();
			document.getElementById('t_clear').className = 'disabled_button';
			document.getElementById('photos_init').style.display = '-moz-box';
			document.getElementById('photos_new').style.display = 'none';
		}
		*/

	},
	
	//simple_add:function(
	_add: function(path, folder_name) {
		block_remove();
		block_sort();

		// Add the original image to the list and set our status
		var id = photos.list.length;
		var p = new Photo(id, path);
		if(photos.is_video(path)){
			p.is_video = true;
		}
		//p.hash = file.compute_file_hash(path);
		photos.list.push(p);
		++photos.count;
		block_normalize();

		// Create a spot for the image, leaving a spinning placeholder
		//   Add images to the start of the list because this is our best
		//   guess for ordering newest to oldest
		/*
		var img = document.createElementNS(NS_HTML, 'img');
		img.className = 'loading';
		img.setAttribute('width', 16);
		img.setAttribute('height', 8);
		img.src = 'chrome://uploadr/skin/balls-16x8-trans.gif';
		var li = document.createElementNS(NS_HTML, 'li');
		li.id = 'photo' + id;
		li.appendChild(img);
		var list = document.getElementById('photos_list');
		list.appendChild(li, list.firstChild);
		*/

		// Create and show the thumbnail
		photos.thumb_cancel = false;
		photos.waiting_on_thumb[p.id] = true;
		//if(!threads.workers[0])
			//threads.workers[0] = Cc['@mozilla.org/thread-manager;1'].getService().newThread(0);
		//threads.workers[0].dispatch(new Thumb(id, conf.thumb_size, path),
			//threads.worker.DISPATCH_NORMAL);
			//
		
		
		
		
		
		//threads.worker.dispatch(new Thumb(id, conf.thumb_size, path),
			//threads.worker.DISPATCH_NORMAL);
		
		
		// Add the original image to the list and set our status
		//var id = photos.list.length;
		//var p = new Photo(id, path);
		
		//the_swf = document.getElementById('the_swf');
	    	//the_swf.add_file(p, folder_name);
		return p;
		
	},
	      
	alert: function(s){
		//Components.utils.reportError(String(s));
	},

	// Remove selected photos
	remove: function() {

		// Respect the remove block
		if (0 < _block_remove) { return; }

		// Nothing to do if somehow there are no selected photos
		var ii = photos.selected.length;
		if (0 == ii) { return; }

		// Tell extensions which photos we're removing
		extension.before_remove.exec(photos.selected);

		// Remove selected photos
		for (var i = 0; i < ii; ++i) {
			var id = photos.selected[i];
			/*
			var li = document.getElementById('photo' + id);
			if(li) {
			    li.parentNode.removeChild(li);
			}
			*/

			// Free the size of this file
			photos.batch_size -= photos.list[id].size;
			if (users.nsid && !users.is_pro && users.bandwidth &&
				0 < users.bandwidth.remaining - photos.batch_size) {
				status.clear();
			}

			photos.list[id] = null;
			--photos.count;
		}
		ui.bandwidth_updated();
		photos.normalize();
		meta.disable();

		// Clear the selection
		photos.selected = [];
		mouse.click({target: {}});

		photos._remove();
	},

	// Allow upload only if there are photos
	_remove: function() {
		if (photos.count) {
			buttons.upload.enable();
		} else {
			photos.sort = true;
			buttons.upload.disable();
			/*
			document.getElementById('photos_sort_default')
				.style.display = 'none';
			document.getElementById('photos_sort_revert')
				.style.display = 'none';
			if (!photos.errors) {
				document.getElementById('t_clear').className = 'disabled_button';
				document.getElementById('photos_init')
					.style.display = '-moz-box';
			}
			document.getElementById('no_meta_prompt')
				.style.visibility = 'hidden';
				*/
		}
	},

	// Rotate selected files
	rotate: function(degrees) {

		// Prevent silliness
		var s = photos.selected;
		var ii = s.length;
		if (0 == ii) { return; }
		photos.selected = [];
		mouse.click({target: {}});

		// For each selected image, show the loading spinner and dispatch
		// the rotate job
		buttons.upload.disable();
		for (var i = 0; i < ii; ++i) {
			block_normalize();
			var p = photos.list[s[i]];
			if (photos.is_photo(p.path)) {
				block_sort();
				photos.batch_size -= p.size;
				
				/*
				var img = document.getElementById('photo' + p.id)
					.getElementsByTagName('img')[0];
				img.className = 'loading';
				img.setAttribute('width', 16);
				img.setAttribute('height', 8);
				img.src = 'chrome://uploadr/skin/balls-16x8-trans.gif';
				*/
				
				threads.worker.dispatch(new Rotate(p.id, degrees,
					conf.thumb_size, p.path),
					threads.worker.DISPATCH_NORMAL);
			}
		}
		threads.worker.dispatch(new EnableUpload(),
			threads.worker.DISPATCH_NORMAL);

	},

	//   Upload photos
	//   The arguments will either both be null or both be set
	//   If they're both set, this is an automated call to upload by the
	//   queue
	upload: function(list, size) {
		var from_user = null == list;
		if (from_user) { list = photos.list; }
		
		var new_list = [];
		for(var j in list){
			new_list[j] = photos.list[list[j][0]];
			new_list[j].is_public = list[j][1];
			new_list[j].title = list[j][2];
		}
		list = new_list;

		// Don't upload if this is a user action and the button is disabled
		/*
		if (from_user && 'disabled_button' == document.getElementById(
			'button_upload').className) {
			return;
		}
		*/

		// Remove error indicators
		/*
		var li = document.getElementById('photos_list')
			.getElementsByTagName('li');
		var ii = li.length;
		for (var i = 0; i < ii; ++i) {
			var img = li[i].getElementsByTagName('img')[0];
			if ('error' == img.className) {
				img.onclick();
			}
		}
		*/

		// Decide if we're already in the midst of an upload
		var not_started = 0 == photos.uploading.length;

		// Drop videos if we're a free user or they're over 100MB
		//   They will have been warned that this is coming
		if (from_user) {
			var new_list = [];
			for each (var p in list) {
				if (null == p) {
					continue;
				}
				if (photos.is_photo(p.path)) {
					new_list.push(p);
				} else if (!users.is_pro || (null == users.videosize
					? conf.videosize : users.videosize) < p.size) {
					photos.batch_size -= p.size;
				} else {
					new_list.push(p);
				}
			}
			list = new_list;
		}

		// If any photos need resizing to fit in the per-photo size limits,
		// dispatch the jobs and wait
		if (from_user && !upload.processing || !from_user) {
			var resizing = false;
			var ready = [];
			var ready_size = 0;
			for each (var p in list) {
				if (null != p) {
					if (photos.is_photo(p.path)) {

						// Resize because of user settings
						if (null != settings.resize &&
							-1 != settings.resize &&
							(p.width > settings.resize ||
							p.height > settings.resize)) {
							resizing = true;
							threads.worker.dispatch(new Resize(
								p.id, settings.resize, p.path),
								threads.worker.DISPATCH_NORMAL);
						}

						// Resize because of upload limits
						else if (p.size > users.filesize) {
							resizing = true;
							threads.worker.dispatch(new Resize(p.id, -1,
								p.path), threads.worker.DISPATCH_NORMAL);
						}

						// Not resizing so record size now
						else {
							ready_size += p.size;
						}

					}

					// By this point there are no videos that break the rules
					else {
						ready_size += p.size;
					}

					ready.push(p);
				}
			}
			if (resizing) {

				// Setup the batch to try again after the resizing
				photos.ready.push(ready);
				photos.ready_size.push(ready_size);
				photos.batch_size = 0;
				//photos.list = [];
				photos.count = 0;
				photos.selected = [];
				photos.last = null;
				/*
				var list = document.getElementById('photos_list');
				while (list.hasChildNodes()) {
					list.removeChild(list.firstChild);
				}
				*/
				ui.bandwidth_updated();
				threads.worker.dispatch(new RetryUpload(true),
					threads.worker.DISPATCH_NORMAL);

				// Give some meaningful feedback
				/*
				if (not_started) {
					document.getElementById('footer').style.display =
						'-moz-box';
					upload.progress_bar = new ProgressBar('progress_bar');
					var progress_text = document.getElementById(
						'progress_text');
					progress_text.className = 'spinning';
					progress_text.value = locale.getString(
						'upload.resizing.status');
					status.set(locale.getString('status.uploading'));
					buttons.upload.disable();
					document.getElementById('photos_sort_default')
						.style.display = 'none';
					document.getElementById('photos_sort_revert')
						.style.display = 'none';
					document.getElementById('photos_init')
						.style.display = 'none';
					document.getElementById('photos_new')
						.style.display = '-moz-box';
					document.getElementById('no_meta_prompt')
						.style.visibility = 'hidden';
					meta.disable();
					photos.sets[users.nsid] = meta.sets;
				}
				*/

				return;
			}
		}

		// Update the UI
		if (from_user) {
			//status.set(locale.getString('status.uploading'));
			//buttons.upload.disable();
			//document.getElementById('photos_sort_default')
				//.style.display = 'none';
			//document.getElementById('photos_sort_revert')
				//.style.display = 'none';
			//document.getElementById('photos_init')
				//.style.display = 'none';
			//document.getElementById('photos_new')
				//.style.display = '-moz-box';
			//document.getElementById('no_meta_prompt')
				//.style.visibility = 'hidden';
			
			//meta.disable();
			
			photos.sets[users.nsid] = meta.sets;
		}

		// We're really going to start or queue a batch, so do extension stuff
		extension.before_upload.exec(list);

		// Take the list of photos into upload mode and reset the UI
		var ready = [];
		for each (var p in list) {

			// Keep the uploading user's NSID with each photo so to allow
			// people to change accounts from one batch to the next
			p.nsid = users.nsid;

			// If we have to queue this batch
			if (from_user && upload.processing) {
				ready.push(p);
			}

			// If we can upload immediately
			else {
				photos.uploading.push(p);

				// Setup progress bar for this photo and show it in the queue
				/*
				var img = document.createElementNS(NS_HTML, 'img');
				img.src = 'file:///' + escape(p.thumb);
				img.width = p.thumb_width;
				img.height = p.thumb_height;
				var stack = document.createElement('stack');
				stack.appendChild(img);
				p.progress_bar = new ProgressBar('queue' +
					(photos.uploading.length - 1), img.width);
				var bar = p.progress_bar.create();
				bar.style.top = (img.height - 20) + 'px';
				stack.appendChild(bar);
				var li = document.createElementNS(NS_HTML, 'li');
				li.appendChild(stack);
				document.getElementById('queue_list').appendChild(li);
				*/

			}

		}
		if (from_user && upload.processing) {
			photos.ready.push(ready);
			photos.ready_size.push(photos.batch_size);
		} else {
			if (from_user) {
				photos.kb.total += photos.batch_size;
		 	} else {
				photos.kb.total += size;
			}
		}
		if (from_user) {
			photos.batch_size = 0;
			photos.list = [];
			photos.count = 0;
			photos.selected = [];
			photos.last = null;
			//var ul = document.getElementById('photos_list');
			//while (ul.hasChildNodes()) {
				//ul.removeChild(ul.firstChild);
			//}
			//ui.bandwidth_updated();
		}

		upload.startTime = new Date().getTime();
        
		// Kick off the first batch job if we haven't started
		if (not_started && !upload.processing) {
			ii = photos.uploading.length;
			for (var i = 0; i < ii; ++i) {
				if (null != photos.uploading[i]) {
					block_exit();
					upload.start(i);
					break;
				}
			}
		}

	},

	/*
	// Normalize the photo list and selected list with the DOM
	normalize: function() {

		// This action is blocked during loading but will always
		// happen at the end of loading
		if (_block_normalize) { return; }

		var list = document.getElementById('photos_list')
			.getElementsByTagName('li');
		var old_list = photos.list;
		photos.list = [];
		photos.selected = [];
		for (var i = list.length - 1; i >= 0; --i) {

			// Move the photo info
			var old_id = parseInt(list[i].id.replace('photo', ''));
			var new_id = photos.list.length;
			list[i].id = 'photo' + new_id;
			photos.list.push(old_list[old_id]);
			photos.list[new_id].id = new_id;

			// Update selection
			if ('selected' == list[i].getElementsByTagName('img')[0]
				.className) {
				photos.selected.push(new_id);
			}

		}
	},

*/

	// Load saved metadata
	load: function(){
		
		//alert("HERE!");
		var obj = file.read('photos.json');
		//alert('start');
		/*
		var i = 0;
		var parts = 1;
		for(var i=0; i<parts;i++){
			photos.call_swf('load_string', [obj.substr(i*obj.length/parts,(i+1)*obj.length/parts)]);
		}
		*/
		

		//if(obj.indexed_paths)
			//photos.indexed_paths = obj.indexed_paths;
		for(var i=0;i<photos.list.length;i++)
			photos.added_paths[photos.list[i].path] = true;
		
		
		if(obj.list)
			photos.list = obj.list
				
		
		/*
		photos.the_swf = document.getElementById('the_swf');
		var sets = obj.flash['sets'];
		for(var i=0;i<sets.length;i++){
			var sl = {'sets':sets.slice(i,i+1)};
			photos.the_swf.load(sl);
			nsWaitForDelay(150);
		}
		*/
		
		photos.call_swf('load', [obj.flash]);
		
		photos.index_some_photos();
		
		
		//thumbnail photos not thumbnailed last time
		for(var i=0; i<photos.list.length; i++){
			if(!photos.list[i].thumb){
				threads.workerPool.dispatch(new Thumb(photos.list[i].id, conf.thumb_size, photos.list[i].path),
						threads.worker.DISPATCH_NORMAL);
			}
		}
			
		//alert('still'+obj.flash);
		
		
		// Don't bother if there are no photos
		//if ('undefined' == typeof obj.list) { return; }

		// Add the previous batch of photos
		//var list = obj.list;
		//if (list.length) {
			//photos.sort = obj.sort;
			//document.getElementById('photos_init').style.display = 'none';
			//document.getElementById('photos_new').style.display = 'none';
			//document.getElementById('no_meta_prompt')
				//.style.visibility = 'visible';
		//}
		//photos.add(list, true);

		// Bring in last known sets configuration
		//meta.sets = obj.sets;

	},

    // clear photos.json
    // this is desperate move when the uploadr is in unusable state
    removeAll: function() {
        //if (document.getElementById('t_clear').className == 'disabled_button')
            //return;
    	//document.getElementById('t_clear').className = 'disabled_button';
    	photos.thumb_cancel = true;
    	if (conf.console.thumb) {
				Cc['@mozilla.org/consoleservice;1']
					.getService(Ci.nsIConsoleService)
					.logStringMessage('clearing');
			}
        photos.list = [];
	photos.indexed_paths = {},
        photos.selected = [];
        photos.count = 0;
        photos.errors = 0;
        photos.batch_size = 0;
        _block_sort = _block_remove = _block_normalize = _block_exit = 0;
        file.remove('photos.json');
	photos.call_swf('reset', []);
        // Remove photos from UI
	/*
        var list = document.getElementById('photos_list');
		while (list.hasChildNodes()) {
		    list.removeChild(list.firstChild);
        }
        document.getElementById('photos_init').style.display = '-moz-box';
	*/
        ui.bandwidth_updated();
        //meta.disable();
        //buttons.upload.disable();
    },
    
	
	// Save all metadata to disk
	save_threaded:function(){
		//photos.flash = photos.the_swf.get_flash_obj();
		photos.flash = photos.call_swf('get_flash_obj', []);
		threads.worker.dispatch(new Save(), threads.worker.DISPATCH_NORMAL);
	},
	save_threaded_callback:function(){
		//Components.utils.reportError('savingthreaded');
		file.write('photos.json', {
			//sort: photos.sort,
			//sets: meta.sets,
			list: photos.list,
			indexed_paths:photos.indexed_paths,
			flash:photos.flash//photos.flash
			//waiting_on_thumb:waiting_on_thumb
		});
		
	},
	
	save: function() {
		//if (0 != _block_exit) { return; }
		//if (1 == photos.selected.length) {
			//meta.save(photos.selected[0]);
		//}
		      
		photos.saving = true;
		photos.thumb_cancel = true;
		Components.utils.reportError('saving');
		file.write('photos.json', {
			//sort: photos.sort,
			//sets: meta.sets,
			list: photos.list,
			//indexed_paths:photos.indexed_paths,
			//flash:photos.the_swf.get_flash_obj()//photos.flash
			flash:photos.call_swf('get_flash_obj', [])//photos.flash
			//waiting_on_thumb:waiting_on_thumb
		});
		
		while(photos.to_add_files.length > 0){
			var a = photos.to_add_files.pop();	
			photos.call_swf('add_files', [a]);
		}
		
		while(photos.to_send_to_flash.length>0){
			var a = photos.to_send_to_flash.pop();
			photos.call_swf('thumbnail_done',[a[0],a[1]]);
		}
		
		
		photos.saving = false;
		photos.thumb_cancel = false;
	},

	// Decide if a given path is a photo
	is_photo: function(path) {
			  if(!path) return false;
			  var ext = path.substring(path.lastIndexOf('.')+1, path.length).toLowerCase();
				  return ext == "jpeg" || ext == "jpg" || ext == "gif";
			  
		//return /\.(jpe?g|tiff?|gif|png|bmp)$/i.test(path);
	},

	// Similarly, is it a video
	is_video: function(path) {
		  if(!path) return false;
		  var ext = path.substring(path.lastIndexOf('.')+1, path.length).toLowerCase();
		  return ext == 'mp4' || ext == 'mpg' || ext == 'mpeg' || ext == 'avi' || ext == 'dv' || ext == 'm4v' || ext == '3gp' || ext == 'mov' ||ext == 'wmv';
		//return /\.(mp4|mpe?g|avi|wmv|mov|dv|3gp|m4v)$/i.test(path);
	}

};

// Setup auto-saving of metadata in case of crashes
//   See photos.save for problems related to the auto-save interval
/*
window.setInterval(function() {
	photos.save();
}, 1000 * conf.auto_save);
*/

/*
window.setInterval(function() {
	photos.indexed_paths = []
	ui.init();
}, 10000);
*/


var flash_save = function(obj){
		//the_swf = document.getElementById('the_swf');
		//photos.flash = obj;//the_swf.get_flash_obj();
		//alert("!"+photos.flash);
};

// Photo properties
var Photo = function(id, path) {
	this.id = id;
	this.path = path;
	this.date_taken = '';
	this.width = 0;
	this.height = 0;
	this.thumb = null;
	this.thumb_width = 0;
	this.thumb_height = 0;
	var filename = path.match(/([^\/\\]*)$/);
	this.filename = null == filename ? p : filename[1];
	this.size = 0; // Kilobytes
	this.title = '';
	this.description = '';
	this.tags = '';
	this.duration = 0;
	this.is_public = settings.is_public;
	this.is_friend = settings.is_friend;
	this.is_family = settings.is_family;
	this.content_type = settings.content_type;
	this.safety_level = settings.safety_level;
	this.hidden = settings.hidden;
	this.sets = [];
	this.is_video = null;
	this.progress_bar = null;
	this.nsid = null;
	this.photo_id = null;
};
