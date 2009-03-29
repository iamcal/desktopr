/*
 * Flickr Uploadr
 *
 * Copyright (c) 2007-2008 Yahoo! Inc.  All rights reserved.  This library is
 * free software; you can redistribute it and/or modify it under the terms of
 * the GNU General Public License (GPL), version 2 only.  This library is
 * distributed WITHOUT ANY WARRANTY, whether express or implied. See the GNU
 * GPL for more details (http://www.gnu.org/licenses/gpl.html)
 */
 var UploadProgressHandler = {
    onProgress: function(remaining, id) {
        if(upload.cancel) {
            threads.gm.cancel(true);
        }
        else {
            threads.main.dispatch(new UploadProgressCallback(remaining, id),
		        threads.main.DISPATCH_NORMAL);
            }
	    },
	onResponse: function(rsp, id) {
	    threads.main.dispatch(new UploadDoneCallback(rsp, id),
	        threads.main.DISPATCH_NORMAL);
	    }
}


var threads = {

	initialized: false,
	// Hooks to threads
	worker: null,
	uploadr: null,
	main: null,
	indexer: null,
	saver: null,
	//workers:[],
	workerPool:null,
	priorityPool:null,

	// 
	// GraphicsMagick XPCOM object
	gm: null,
	
	// Create thread hooks and instantiate GraphicsMagick
	init: function(){
		try {
			var source = conf.base_url;
			var target = '/flash/Desktop.swf';
			//
			if(source.indexOf('http://') != -1)
				file.save_from_url(source+'/flash/Desktop.swf', target);
			//document.loadOverlay('chrome://uploadr/content/main_body.xul', null);
			document.loadOverlay('chrome://uploadr/content/embed.xul', null);
			
			// Threads themselves
			var t = Cc['@mozilla.org/thread-manager;1'].getService();
			threads.worker = t.newThread(0);
			threads.workerPool = Cc['@mozilla.org/thread-pool;1'].createInstance(Ci.nsIThreadPool);
			threads.workerPool.threadLimit = conf.maxThreadsCount;
			threads.priorityPool = Cc['@mozilla.org/thread-pool;1'].createInstance(Ci.nsIThreadPool);
			threads.priorityPool.threadLimit = conf.maxThreadsCount;
			threads.uploadr = t.newThread(0);
			threads.indexer = t.newThread(0);
			threads.saver = t.newThread(0);
			threads.main = t.mainThread;
			
			//not sure this does anything..
			/*
			threads.main.priority = -1;
			threads.uploadr.priority = 2;
			threads.indexer.priority = 4;
			threads.worker.priority = 5;
			*/

			// GraphicsMagick, for use on the worker thread
			// GraphicsMagick, for use on the worker thread
			threads.gm = Cc['@flickr.com/gm;1'].createInstance(Ci.flIGM);
			threads.gm.init(Cc['@mozilla.org/file/directory_service;1']
				.getService(Ci.nsIProperties)
				.get('resource:app', Ci.nsIFile).path, UploadProgressHandler);
			new Date(); // hack so that new Date() works on worker threads. It must initialised some stuff and needs to be called on the main thread first!?
			threads.initialized = true;
			
		} catch (err) {
			Components.utils.reportError(err);
		}
	}

};

/** 
 * Netscape compatible WaitForDelay function. 
 * You can use it as an alternative to Thread.Sleep() in any major programming language 
 * that support it while <STRONG class="highlight">JavaScript</STRONG> it self doesn't have any built-in function to do such a thing. 
 * parameters: 
 *  (Number) delay in millisecond 
*/  
var nsWaitForDelay = function(delay){
  try{  
	/** 
	* Just uncomment this code if you're building an extention for Firefox. 
	* Since FF3, we'll have to ask for user permission to execute XPCOM objects. 
	*/  
	//netscape.security.PrivilegeManager.enablePrivilege("UniversalXPConnect");  
  
	// Get the current thread.  
	var thread = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager).currentThread;  
  
	// Create an inner property to be used later as a notifier.  
	this.delayed = true;  
  
	/* Call <STRONG class="highlight">JavaScript</STRONG> setTimeout function 
	 * to execute this.delayed = false 
	 * after it finish. 
	 */  
	setTimeout("this.delayed = false;", delay);  
  
	/** 
	 * Keep looping until this.delayed = false 
	*/  
	while (this.delayed) {  
		/** 
		 * This code will not freeze your browser as it's documented in here: 
		 * https://developer.mozilla.org/en/Code_snippets/Threads#Waiting_for_a_background_task_to_complete 
		*/  
		thread.processNextEvent(true);  
	}  
  }catch(e) {	
  }   
}  

// 
// Thumbnail thread wrapper
var Thumb = function(id, thumb_size, path, auto_select) {
	photos.thumb_thread_counter+=1;
	this.id = id;
	this.thumb_size = thumb_size;
	this.path = path;
	this.auto_select = null == auto_select ? false : auto_select;
};

Thumb.prototype = {
	run: function() {
		if(photos.thumb_cancel === true)
			return;
		var result = '';

		try {
			// Thumbnail your photos
			if (photos.is_photo(this.path)) {
				result = threads.gm.thumb(this.thumb_size, this.path);
			}

			// But get a keyframe for videos
			else if (photos.is_video(this.path)) {
				result = threads.gm.keyframe(this.thumb_size, this.path);
			}

		}

		// The nerdy error message
		catch (err) {
			Components.utils.reportError(err);
		}

		// Phone home to the UI
		threads.main.dispatch(new ThumbCallback(this.id, result,
			this.auto_select), threads.main.DISPATCH_NORMAL);

	},
	     
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};

var ThumbCallback = function(id, result, auto_select) {
	this.id = id;
	this.result = result;
	this.auto_select = auto_select;
};

ThumbCallback.prototype = {
	run: function() {
	if (photos.thumb_cancel === true)
		return;
		try {
			unblock_normalize();

			if (conf.console.thumb) {
				Cc['@mozilla.org/consoleservice;1']
					.getService(Ci.nsIConsoleService)
					.logStringMessage('GM THUMB: ' + this.result);
			}
            //if(threads.workers[this.id]) {
              //  threads.workers[this.id].shutdown();
            //}
			

			// Parse the returned string
			//   <orient>###<width>###<height>###<date_taken>###<thumb_width>###<thumb_height>###<thumb_path>###<title>###<description>###<tags>
			var thumb = this.result.split('###');

			// Get this photo from the DOM and remove its loading class
			//var img = document.getElementById('photo' + this.id)
				//.getElementsByTagName('img')[0];
			//img.style.visibility = 'hidden';
			//img.className = '';

			// If successful, replace with the thumb and update the
			// Photo object
			if (7 <= thumb.length) {

				// Undo escaping done in XPCOM
				var ii = thumb.length;
				for (var i = 0; i < ii; ++i) {
					thumb[i] = thumb[i]; //wha? -Ashot
				}

				// Orientation (for photos) or duration (for videos)
				//   Orientation is currently unused
				if (photos.is_video(photos.list[this.id].path)) {
					photos.list[this.id].duration = parseInt(thumb[0]);
				}

				// Width and height
				photos.list[this.id].width = parseInt(thumb[1]);
				photos.list[this.id].height = parseInt(thumb[2]);

				// Date taken
				if (/\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(thumb[3])) {
					photos.list[this.id].date_taken = thumb[3];
				} else {
					var f = Cc['@mozilla.org/file/local;1'].createInstance(
						Ci.nsILocalFile);
					f.initWithPath(photos.list[this.id].path);
					var mod = new Date(f.lastModifiedTime);
					var month = mod.getMonth();
					if (10 > month) month = '0' + month;
					var day = mod.getDate();
					if (10 > day) day = '0' + day;
					var hours = mod.getHours();
					if (10 > hours) hours = '0' + hours;
					var minutes = mod.getMinutes();
					if (10 > minutes)  minutes = '0' + minutes;
					var seconds = mod.getSeconds();
					if (10 > seconds) seconds = '0' + seconds;
					photos.list[this.id].date_taken = mod.getFullYear() +
						':' + month + ':' + day + ' ' + hours + ':' +
						minutes + ':' + seconds;
				}

				// Thumbnail
				photos.list[this.id].thumb_width = parseInt(thumb[4]);
				photos.list[this.id].thumb_height = parseInt(thumb[5]);
				//img.setAttribute('width', thumb[4]);
				//img.setAttpribute('height', thumb[5]);
				var thumbPath = thumb[6].replace(/^\s+|\s+$/g, '')
						.replace(/\{---THREE---POUND---DELIM---\}/g, '###');
				//img.src = 'file:///' + escape(thumbPath);
				photos.list[this.id].thumb = thumbPath;
				//photos.list[this.id].hash = file.compute_file_hash(thumbPath);
				if(!photos.saving){
					if(photos.list[this.id].thumb_width < 400){
						photos.call_swf('thumbnail_done', [photos.list[this.id], thumbPath]);
					}
					else{
						photos.call_swf('big_done', [photos.list[this.id], thumbPath]);
					}
					//var the_swf = document.getElementById("the_swf");
					//the_swf.thumbnail_done(photos.list[this.id], thumbPath);
				}
				else{
					photos.to_send_to_flash.push([this.id, thumbPath]);
				}
				//photos.waiting_to_thumb-=1;

				// Make video icons for videos
				//   This will look funny for a portrait-oriented video
				/*
				if (photos.is_video(photos.list[this.id].path)) {
					var icon = document.createElementNS(NS_HTML, 'img');
					icon.setAttribute('width', 11);
					icon.setAttribute('height', 11);
					icon.src = 'chrome://uploadr/skin/icon_video.png';
					icon.style.position = 'absolute';
					icon.style.margin = '-20px 0 0 7px';
					img.parentNode.appendChild(icon);
				}
				*/

				// Title/tags/description
				if ('' == photos.list[this.id].title) {
					var title = thumb[7] ?
						thumb[7].replace(/^\s+|\s+$/, '')
						.replace(/\{---THREE---POUND---DELIM---\}/g, '###')
						.replace(/^lang="[^"]+"\s*/g, '') : '';
					if ('' == title) {
						title = photos.list[this.id].filename.split(
							/(.+)\.[a-z0-9]{3,4}/i);
						photos.list[this.id].title = title[1];
					} else {
						photos.list[this.id].title = title;
					}
				}
				if ('' == photos.list[this.id].description) {
					var desc = thumb[8] ?
						thumb[8].replace(/^\s+|\s+$/g, '')
						.replace(/\{---THREE---POUND---DELIM---\}/g, '###')
						.replace(/^lang="[^"]+"\s*/g, '') : '';

					// Copy the site's rules for bad descriptions
					if ('DCF 1.0' == desc ||
						'Samsung' == desc ||
						'Nucam Tulip Project' == desc ||
						'IslBG' == desc ||
						'SONY DSC' == desc ||
						'Pentax Image' == desc ||
						/^(?:OLYMPUS|(?:KONICA )?MINOLTA|SANYO) DIGITAL CAMERA$/
						.test(desc) ||
						/^\d{6}_\d{4}(?:\~\d+)?$/.test(desc) ||
						/^Copyright \(c\) \d+ Hewlett-Packard Company$/
						.test(desc) ||
						/^Autosave-File.*AgfaPhoto.*$/.test(desc)) {
						photos.list[this.id].description = '';
					}

					// Passed the test
					else {
						photos.list[this.id].description = desc;
					}

				}
				if ('' == photos.list[this.id].tags) {
					photos.list[this.id].tags = thumb[9] ? thumb[9]
						.replace(/^\s+|\s+$/g, '')
						.replace(/\{---THREE---POUND---DELIM---\}/g, '###')
						: '';
				}

				// Select newly added images if the user hasn't clicked
				if (meta.auto_select || this.auto_select) {
					mouse.click({
						target: img,
						ctrlKey: true,
						metaKey: true,
						shiftKey: false
					});
				}

				// If only one photo is selected, refresh the other
				// thumbnail, too
				if (1 == photos.selected.length
					&& this.id == photos.selected[0] && !meta.first) {
					document.getElementById('meta_div')
						.getElementsByTagName('img')[0].src = img.src;
				}

				// Calculate file size
				photos.list[this.id].size = file.size(
					photos.list[this.id].path);
				photos.batch_size += photos.list[this.id].size;
				ui.bandwidth_updated();
			}

			// If unsuccessful, replace with the error image
			else {
				/*
				img.setAttribute('src',
					'chrome://uploadr/skin/icon_alert.png');
				img.setAttribute('width', 16);
				img.setAttribute('height', 16);
				img.className = 'error';
				img.parentNode.appendChild(document.createTextNode(
					photos.list[this.id].filename));
				--photos.count;
				++photos.errors;
				img.onclick = function() {
					this.parentNode.parentNode.removeChild(this.parentNode);
					photos.normalize();
					--photos.errors;
					if (0 == photos.count + photos.errors) {
						document.getElementById('t_clear').className = 'disabled_button';
						document.getElementById('photos_init')
							.style.display = '-moz-box';
					}
				};
				*/
				Components.utils.reportError(this.result);
			}

			// After updating, make it visible again
			//img.style.visibility = 'visible';

		} catch (err) {
			Components.utils.reportError(err);
		}

		photos.waiting_to_thumb-=1
		photos.waiting_on_thumb[this.id] = null;
		//if(photos.waiting_to_thumb==0){
			//setTimeout("ui.init();", 100);
		//}
		// Tell extensions that we got a new thumbnail
		extension.after_thumb.exec(this.id);

		unblock_sort();
		unblock_remove();
		photos.thumb_thread_counter-=1;
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};

// Rotate thread wrapper
var Rotate = function(id, degrees, thumb_size, path) {
	this.id = id;
	this.degrees = degrees;
	this.thumb_size = thumb_size;
	this.path = path;
};

Rotate.prototype = {
	run: function() {
		try {

			// Rotate and if successful re-thumb the image
			var result = threads.gm.rotate(this.degrees, this.path);

			// Parse the returned string
			//   ok<path>
			var rotate = result.match(/^ok(.*)$/);

			if (null == rotate) {
				Components.utils.reportError(result);
			} else {
				threads.main.dispatch(new RotateCallback(this.id, rotate[1]),
					threads.main.DISPATCH_NORMAL);
				result = threads.gm.thumb(this.thumb_size,
					rotate[1]);
				threads.main.dispatch(new ThumbCallback(this.id, result,
					conf.auto_select_after_rotate),
					threads.main.DISPATCH_NORMAL);
			}

		} catch (err) {
			Components.utils.reportError(err);
		}
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};
var RotateCallback = function(id, path) {
	this.id = id;
	this.path = path;
};

RotateCallback.prototype = {
	run: function() {
		unblock_normalize();
		photos.list[this.id].path = this.path;

		// Tell extensions that this photo was edited (rotated)
		extension.after_edit.exec([this.id]);

	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};

// Sorting thread wrapper
//   The sorting all happens in the UI thread but this empty background job ensures it
//   happens after all the added photos have been processed
var Sort = function() {
};

Sort.prototype = {
	run: function() {
		try {

			// The background job is just to ensure the sort only happens after the last
			// photo has been processed - go back to the UI thread
			threads.main.dispatch(new SortCallback(), threads.main.DISPATCH_NORMAL);

		} catch (err) {
			Components.utils.reportError(err);
		}
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};
var SortCallback = function() {
};

SortCallback.prototype = {
	run: function() {

		// Allow blocking sorts during loading
		if (0 != _block_sort) { return; }

		// Perform the sort
		if (1 >= photos.list.length) {
			if (1 == photos.list.length) { buttons.upload.enable(); }
			unblock_normalize();
			return;
		}
		var p = [];
		for each (var photo in photos.list) {
			if (null != photo) {
				p.push({
					id: photo.id,
					date_taken: photo.date_taken
				});
			}
		}
		p.sort(function(a, b) {
			return a.date_taken > b.date_taken;
		});

		// Lazily do the UI refresh by appendChild'ing everything in the
		// right order
		//   This is far from being a bottleneck, so leave it alone
		//   until it is
		var list = document.getElementById('photos_list');
		for (var i = p.length - 1; i >= 0; --i) {
			if (null != p[i]) {
				list.appendChild(document.getElementById('photo' + p[i].id));
			}
		}
		unblock_normalize();
		photos.normalize();

		// And finally allow them to upload
		buttons.upload.enable();
		meta.first = false;

		// Tell extensions that photos were sorted
		extension.after_reorder.exec(false);

	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};

var Resize = function(id, square, path) {
	this.id = id;
	this.square = square;
	this.path = path;
};

Resize.prototype = {
	run: function() {
		try {

			// Resize the image and callback to the UI thread
			var result = threads.gm.resize(this.square, this.path);
			threads.main.dispatch(new ResizeCallback(this.id, result),
				threads.main.DISPATCH_NORMAL);

		} catch (err) {
			Components.utils.reportError(err);
		}
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};
var ResizeCallback = function(id, result) {
	this.id = id;
	this.result = result;
};

ResizeCallback.prototype = {
	run: function() {
		try {

			// Parse the returned string
			//   <width>x<height><path>
			var resize = this.result.match(/^([0-9]+)x([0-9]+)(.+)$/);

			if (null == resize) {
				Components.utils.reportError(this.result);
			} else {
				list = photos.ready[photos.ready.length - 1];
				//for(var j in list){
				
			//Components.utils.reportError(j);
//}
			//Components.utils.reportError(this.id);
//alert('!' +list.length);
//alert('!'+this.id);

				// Update photo properties
				list[this.id].width = resize[1];
				list[this.id].height = resize[2];
				list[this.id].path = resize[3];

				// Update bandwidth
				var size = file.size(resize[3]);
				photos.ready_size[photos.ready.length - 1] += size;
				list[this.id].size = size;

			}
		} catch (err) {
			Components.utils.reportError(err);
		}
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};

// Job to enable uploads that can follow a bunch of jobs in the queue
var IndexDrive = function() {
	
};
IndexDrive.prototype = {
	paths:[],
	run: function() {
		if(photos.thumb_cancel === true)
			return;
		
		this.num_each_time = 400;
		
		if(!photos.file){
			path = Cc['@mozilla.org/file/directory_service;1']
				.getService(Ci.nsIProperties).get('ProfD', Ci.nsIFile).path;
			if (path.match(/^\//)) {
				path += '/../../../../../Pictures';
			} else {
				path += '\\..\\..\\..\\..\\..\\My Documents\\My Pictures';
			}
			photos.file = Cc['@mozilla.org/file/local;1']
				.createInstance(Ci.nsILocalFile);
			photos.file.initWithPath(path);
		}

		
		//photos.file.initWithPath("C:\\");//Documents and Settings\\ashot\\My Documents\\My Pictures");
		//if(!this.last_dir)
			//this.last_dir = photos.file

		this.paths = [];
		this.dirs_marked = 0;
		this.process_dir(photos.file, photos.file.directoryEntries, photos.file.leafName);
		
		if(this.paths.length < this.num_each_time && this.dirs_marked < this.num_each_time){
			photos.wait_time = 3000;
			photos.indexed_dirs = {};
		}
			//this.last_dir = photos.file;
		
		this.paths.reverse();
		
		//if(this.paths.length > 0)
			threads.main.dispatch(new IndexDriveCallback(this.paths), threads.main.DISPATCH_NORMAL);
		// Add the original image to the list and set our status
	},
	
	process_dir: function(file, files,folder_name) {
		var count = 0;
		this.last_dir = file;
		//NOTE: was 400
		while (this.dirs_marked < this.num_each_time && this.paths.length < this.num_each_time && files.hasMoreElements()) {
			var f = files.getNext();
			f.QueryInterface(Components.interfaces.nsIFile);
			if (f.isDirectory() && !photos.indexed_dirs[f.path]){
				if(f.leafName != 'Flickr Uploadr'){
					try{
						count+=this.process_dir(f, f.directoryEntries,f.leafName);
					}
					catch(e){
						photos.alert('could not process ' + f.path);
					}
				}
			} else {
				var p = f.path;
				if((photos.is_photo(p) || photos.is_video(p)) && !photos.indexed_paths[p]){
					//photos.add([p]);
					photos.waiting_to_thumb++;
					count+=1;
					this.paths.push([p,folder_name]);
					photos.indexed_paths[p]=true;
				}
			}
			//nsWaitForDelay(500);
		}
		
		if(count==0){
			this.dirs_marked+=1;
			photos.indexed_dirs[file.path] = true;
		}
		
		return count;
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};

var IndexDriveCallback = function(paths) {
	this.paths = paths;
};

IndexDriveCallback.prototype = {
	run: function() {
		if(photos.thumb_cancel != true){
			if(this.paths.length > 0){
				photos.add(this.paths, true); // silent
				photos.wait_time = 1;
			}
		}
		setTimeout("photos.index_some_photos()", photos.wait_time);
	},
	
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};

// Job to enable uploads that can follow a bunch of jobs in the queue
var EnableUpload = function() {
};
EnableUpload.prototype = {
	run: function() {
		threads.main.dispatch(new EnableUploadCallback(), threads.main.DISPATCH_NORMAL);
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};
var EnableUploadCallback = function() {
};
EnableUploadCallback.prototype = {
	run: function() {
		unblock_normalize();
		buttons.upload.enable();
		meta.first = false;
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};


// Retry an upload batch after we finish resizing
var RetryUpload = function(from_ready) {
	this.from_ready = from_ready;
};

RetryUpload.prototype = {
	run: function() {

		// As with Sort, the background job here is just for ordering
		threads.main.dispatch(new RetryUploadCallback(this.from_ready),
			threads.main.DISPATCH_NORMAL);

	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};
var RetryUploadCallback = function(from_ready) {
	this.from_ready = from_ready;
};

RetryUploadCallback.prototype = {
	run: function() {

		// Take a batch from the ready queue
		if (this.from_ready && 0 != photos.ready.length) {
			photos.upload(photos.ready.shift(),
				photos.ready_size.shift());
		}

		// Take the batch in the UI
		else { photos.upload(); }

	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};

// Job to force ordering of photo._add calls for dock.xul
var PhotoAdd = function(path) {
	this.path = path;
};
PhotoAdd.prototype = {
	run: function() {
		threads.main.dispatch(new PhotoAddCallback(this.path),
			threads.main.DISPATCH_NORMAL);
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};
var PhotoAddCallback = function(path) {
	this.path = path;
};
PhotoAddCallback.prototype = {
	run: function() {
		photos.add([this.path]);
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};

var Save = function() {
};
Save.prototype = {
	run: function() {
		photos.save_threaded_callback();
		//threads.main.dispatch(new SaveCallback(),
			//threads.main.DISPATCH_NORMAL);
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};
var SaveCallback = function() {
};
SaveCallback.prototype = {
	run: function() {
	},
	QueryInterface: function(iid) {
		if (iid.equals(Ci.nsIRunnable) || iid.equals(Ci.nsISupports)) {
			return this;
		}
		throw Components.results.NS_ERROR_NO_INTERFACE;
	}
};


