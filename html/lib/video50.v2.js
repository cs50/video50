// compatibility with CS50 libraries
var CS50 = CS50 || {};

/*
 * Constructor for CS50 Video library.
 *
 * @param options Object Video50 options:
 *      aspectRatio: float, aspect ratio for a single video
 *      defaultLanguage: string, default language for subtitles, transcript
 *      download: object, maps download name to video download urls
 *      onReady: function, function to call when player is finished loading
 *      numVideos: int, the number of video screens to show
 *      playbackRates: array of floats, supported playback rates
 *      playerContainer: string, CSS selector of the desired element
 *      captions: object, maps language abbreviation to URLs of SRT files
 *      title: string title of the video
 *      video: string for single video, or 
 *             object that maps bitrate to a single video source's URL, or
 *             object that maps bitrate to an array of video URLs, if the videos are not concatenated. 
 *
 */
CS50.Video = function(options) {
    var me = this;
    this.options = options;

    // required options must be defined
    if (!this.options.playerContainer)
        throw 'Error: You must define a container for CS50 Video!';
    if (!this.options.files)
        throw 'Error: You must define a video for CS50 Video to play!';

    // fill in default values for optional, undefined values
    this.options = $.extend({
        aspectRatio: 16/9,
        defaultLanguage: 'eng',
        onReady: false,
        playbackRates: [0.7, 1, 1.2, 1.5],
        title: '',
    }, this.options);
    
    // detect compatibility for various video types
    var testEl = document.createElement("video");
    me.supportsHTML5 = testEl.canPlayType;
    if (testEl.canPlayType) {
        this.options.supportsMP4 = "" !== (testEl.canPlayType('video/mp4; codecs="mp4v.20.8"') ||
                  testEl.canPlayType('video/mp4; codecs="avc1.42E01E"') ||
                  testEl.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'));
        this.options.supportsWebM = "" !== testEl.canPlayType('video/webm; codecs="vp8, vorbis"');
    }

    // handle different argument types of "video" option
    for (var i = 0; i < this.options.files.length; i++) {
        // must support all videos in an array to support to entire array
        if (this.options.files[i] instanceof Array) {
            var support = true;
            for (var j = 0; j < this.options.files[i].length; j++) {
                 support = support && me.supportsFormat(this.options.files[i][j].type);
            }

            if (this.options.currentVideo === undefined && support)
                this.options.currentVideo = this.options.files[i];
        }
        // for supported files in concatenated format, fill in some default values if unspecified
        else if (me.supportsFormat(this.options.files[i].type)) {
            this.options.files[i] = $.extend({
                rows: 1,
                cols: 1,
                numVideos: (this.options.files[i].rows || 1) * (this.options.files[i].cols || 1)
            }, this.options.files[i]);

            this.options.files[i].singleHeight = this.options.files[i].height / this.options.files[i].rows;
            this.options.files[i].singleWidth = this.options.files[i].width / this.options.files[i].cols;

            if (this.options.currentVideo === undefined)
                this.options.currentVideo = this.options.files[i];
        }
    }

    // no supported file formats uh oh
    if (this.options.currentVideo === undefined) {
        throw 'Error: None of the given video files are supported in this browser';
    }

    // private member variable for template structure
    var templateHtml = {
        player: ' \
            <div class="video50-wrapper" tabindex="1"> \
                <div class="video50-videos-wrapper"> \
                    <%= playerHTML %> \
                </div> \
            </div> \
        ',

        // for concatenated videos, using canvas
        playerCanvas: ' \
            <div class="video50-left"> \
              <div class="video50-main-video-wrapper"> \
                <video class="video50-source-video video50-video" data-segment="0" src="<%- video.file %>"> \
                </video> \
                <div class="video50-cc-container"> \
                    <div class="video50-cc-text"></div> \
                </div> \
              </div> \
            </div> \
            <div class="video50-dragger">  \
            </div> \
            <div class="video50-right"> \
              <div class="video50-ancilliary-videos"> \
                <% for (var i = 1; i < video.numVideos; i++) { %> \
                    <canvas class="video50-canvas video50-video" width="<%- video.width / video.cols %>" height="<%- video.height / video.rows %>" data-segment="<%= i %>"></canvas> \
                <% } %> \
              </div> \
            </div> \
        ',

        // for synced individual <video> tags
        playerVideo: ' \
            <div class="video50-left"> \
              <div class="video50-main-video-wrapper"> \
                <video class="video50-source-video video50-video" data-segment="0" src="<%- video.file || video[0].file %>"></video> \
                <div class="video50-cc-container"> \
                    <div class="video50-cc-text"></div> \
                </div> \
              </div> \
            </div> \
            <div class="video50-dragger">  \
            </div> \
            <div class="video50-right"> \
              <div class="video50-ancilliary-videos"> \
                <% for (var i = 1; i < video.length; i++) { %> \
                    <video class="video50-video" data-segment="<%= i %>" src="<%- video[i].file %>"></video> \
                <% } %> \
              </div> \
            </div> \
        ',
        
        // for synced individual jwplayer instances
        playerFlash: ' \
            <div class="video50-left"> \
              <div class="video50-main-video-wrapper"> \
                <div class="video50-source-video video50-flash-wrapper video50-video" data-segment="0"> \
                    <div id="a" class="video50-flash" data-src="<%- video.file || video[0].file %>"></div> \
                </div> \
                <div class="video50-cc-container"> \
                    <div class="video50-cc-text"></div> \
                </div> \
              </div> \
            </div> \
            <div class="video50-dragger"> \
            </div> \
            <div class="video50-right"> \
              <div class="video50-ancilliary-videos"> \
                <% for (var i = 1; i < video.length; i++) { %> \
                    <div class="video50-flash-wrapper video50-video" data-segment="<%= i %>"> \
                        <div id="<%= String.fromCharCode(97 + i) %>" class="video50-flash" data-src="<%- video[i].file %>"></div> \
                    </div> \
                <% } %> \
              </div> \
            </div> \
        ',
        
        playerControls: ' \
            <div class="video50-control-bar"> \
              <div class="video50-left-controls"> \
                <div class="video50-play-pause-control pause"> \
                </div><div class="video50-sb-control"> \
                </div><div class="video50-sf-control"> \
                </div> \
              </div> \
              <div class="video50-time"> \
                <div class="video50-timecode"></div> \
                <div class="video50-timeline"><div class="video50-progress"></div></div> \
                <div class="video50-timelength"></div> \
              </div> \
              <div class="video50-right-controls"> \
                <div class="video50-download-control video50-control-toggle"> \
                    <ul class="video50-download-container video50-control-list"> \
                        <% _.each(files, function(file, i) { %> \
                            <% \
                                if (!(file instanceof Array)) \
                                    file = [file]; \
                            %> \
                            <% _.each(file, function(subfile, j) { %> \
                                <li class="video50-download"> \
                                    <a href="<%- subfile.subfile %>?download"> \
                                        <% if (subfile.type === "video/mp4" || subfile.type === "video/webm") { %> \
                                            <%- subfile.type.split("/")[1].toUpperCase() + " (" + subfile.height + "p)" %> \
                                        <% } else { %> \
                                            <%- subfile.type.split("/")[1].toUpperCase() %> \
                                        <% } %> \
                                    </a> \
                                </li> \
                            <% }) %> \
                        <% }) %> \
                        <% if (captions && _.keys(captions).length > 0) { %> \
                            <li class="video50-download"> \
                                <a class="video50-transcript-download" href="<%- captions[defaultLanguage] %>?download"> \
                                    SRT (<%- CS50.Video.Languages[defaultLanguage] || "Unknown Language" %>) \
                                </a> \
                            </li> \
                        <% } %> \
                    </ul> \
                </div><div class="video50-captions-control video50-control-toggle"> \
                    <ul class="video50-captions-container video50-control-list"> \
                        <li class="video50-caption"><a href="#" data-lang="">Off</a></li> \
                        <% _.each(captions, function(path, short) { %> \
                            <li class="video50-caption" data-lang="<%- short %>"><%- CS50.Video.Languages[short] || "Unknown Language" %></li> \
                        <% }) %> \
                    </ul> \
                    <div class="video50-transcript-container"></div> \
                </div><div class="video50-speed-control video50-control-toggle"><div class="video50-curspeed">1x</div> \
                    <ul class="video50-speed-container video50-control-list"> \
                        <% _.each(playbackRates, function(rate, index) { %> \
                            <li class="video50-speed" data-rate="<%- rate %>"><%- rate %>x</li> \
                        <% }) %> \
                    </ul> \
                </div><div class="video50-quality-control video50-control-toggle"><div class="video50-curquality"></div> \
                    <ul class="video50-quality-container video50-control-list"> \
                        <% _.each(files, function(file, i) { %> \
                            <% if (file.type === "video/mp4" && supportsMP4) { %> \
                                <li class="video50-quality" data-index="<%- i %>"><%- file.height / file.rows %>p (MP4)</li> \
                            <% } else if (supportsWebM && file.type === "video/webm") { %> \
                                <li class="video50-quality" data-index="<%- i %>"><%- file.height / file.rows %>p (WebM)</li> \
                            <% } else if (file instanceof Array) { %> \
                                <% var supports = true; %> \
                                <% var type = undefined; %> \
                                <% \
                                    _.each(file, function(subfile, j) { \
                                        if (subfile.type == "video/webm" && supportsWebM) \
                                            type = (type == "MP4" || type == "Mixed") ? "Mixed" : "WebM"; \
                                        else if (subfile.type == "video/mp4" && supportsMP4) \
                                            type = (type == "WebM" || type == "Mixed") ? "Mixed" : "MP4"; \
                                        else \
                                            supports = false; \
                                    }); \
                                %> \
                                <% if (supports) { %> \
                                    <li class="video50-quality" data-index="<%- i %>"><%- file[0].height %>p (Multistream <%- type %>)</li> \
                                <% } %> \
                            <% } %> \
                        <% }) %> \
                    </ul> \
                </div><div class="video50-fullscreen-control"> \
                </div> \
              </div> \
            </div> \
        ',
    };
    
    // compile templates with underscore, expose templates to prototype functions
    this.templates = {};
    for (var template in templateHtml) {
        this.templates[template] = _.template(templateHtml[template]);
    }

    this.createPlayer();
};

/*
 *  Creates a new instance of the player in the specified container.
 * 
 *  @param state optional prior state of player to restore, if it exists.
 */
CS50.Video.prototype.createPlayer = function(state) {
    var me = this;
    var $container = $(me.options.playerContainer);
    
    // clear out old containers 
    if (me.first === undefined) 
        $container.empty();

    // XXX: factor function that determines what type of player to instantiate
    var modes = ["canvas", "video", "flash"];

    // if we've supplied an array of videos, then multistream
    if (me.options.currentVideo instanceof Array) {
        me.mode = me.supportsHTML5 ? "video" : "flash";
        me.fullmode = false;
    } 
    else {
        // use canvas singlestreaming if more than 1 video provided and HTML5 supported
        if (me.options.currentVideo.numVideos > 1 && me.supportsHTML5) {
            me.mode = "canvas";
            me.fullmode = false;
        }
        // if not, set flag fullmode that expands video to viewport, and show a single video
        else {
            me.mode = me.supportsHTML5 ? "video" : "flash";
            me.fullmode = true; 
        }
    }

    // grab HTML for the player area
    var playerHTML;
    switch(me.mode) {
        case "canvas":
            playerHTML = me.templates.playerCanvas({
                video: me.options.currentVideo
            });
            break;
        case "video":
            playerHTML = me.templates.playerVideo({
                video: me.options.currentVideo
            });
            break;
        case "flash":
            playerHTML = me.templates.playerFlash({
                video: me.options.currentVideo    
            });
            break;
    }
    
    // XXX: don't re-execute on a quality change to avoid rebuilding a large bulk of the DOM
    if (me.first === undefined) {
        // construct the actual player, swap the container to a tighter scope
        $container = $container.html(me.templates.player({
            video: me.options.currentVideo,    
            playerHTML: playerHTML
        })).find('.video50-wrapper');

        // attach the control bar to the player
        $container.append(this.templates.playerControls({
            playbackRates: this.options.playbackRates,
            downloads: this.options.downloads,
            captions: this.options.captions,
            defaultLanguage: this.options.defaultLanguage,
            files: this.options.files,
            supportsMP4: this.options.supportsMP4,
            supportsWebM: this.options.supportsWebM
        }));
        me.first = true;
    } 
    else {
        // detach all previous handlers on the video area
        // detach all previous handlers on the controlbar
        // detach all previous handlers on the window
        $container.off('.video50');
        $(window).off('.video50');

        // XXX: turn off any timeouts 
        // XXX: turn off webkitanimationrequest syncing
        // XXX: turn off flash events (XXX: do we have to properly destroy jwplayer instances??)
        clearTimeout(me.timeout);

        // only swap out the part of the DOM related to the videos
        $container.find('.video50-videos-wrapper').html(playerHTML);
    
        // make the video control paused, so quality jiggering will cause playback to happen
        $container.find('.video50-play-pause-control').addClass('pause');
    }

    // for each mode, perform different operations for instantiating the player
    // attach function handlers for the different operations of seeking, resizing, etc.
    switch (me.mode) {
        case "canvas":
            // video related updates 
            me.video = $container.find(".video50-source-video")[0];
            me.canvases = $container.find('.video50-canvas');
            me.controlBarHandlers({
                play: function() { me.video.play() },
                pause: function() { me.video.pause() },
                seek: function(time) { me.video.currentTime = time; },
                duration: function() { return me.video.duration; },
                position: function() { return me.video.currentTime; },
                playbackRate: function(speed) { me.video.playbackRate = speed; }
            });
            me.videoHandlers({
                duration: function() { return me.video.duration; },
                swap: this.swapHandlers()[me.mode]
            });
            break;
        case "video":
            // set the videos accordingly
            me.video = $container.find('.video50-source-video')[0];
            me.subVideos = $container.find('.video50-ancilliary-videos > video')
                                     .prop('muted', true)
                                     .get();
                                 
            me.controlBarHandlers({
                play: function() { 
                    me.video.play(); 
                    $.each(me.subVideos, function(i, v) { v.play(); });
                },
                pause: function() { 
                    me.video.pause(); 
                    $.each(me.subVideos, function(i, v) { v.pause(); });
                },
                seek: function(time) { 
                    me.video.currentTime = time; 
                    $.each(me.subVideos, function(i, v) { v.currentTime = time; });
                },
                duration: function() { return me.video.duration; },
                position: function() { return me.video.currentTime; },
                playbackRate: function(speed) { 
                    me.video.playbackRate = speed; 
                    $.each(me.subVideos, function(i, v) { v.playbackRate = speed; });
                }
            });
        
            me.videoHandlers({
                duration: function() { return me.video.duration; },
                swap: this.swapHandlers()[me.mode]
            });
            break;
        case "flash":
            // instantiate the flash players
            var $main = $('.video50-source-video .video50-flash');
            var $ancilliary = $('.video50-ancilliary-videos .video50-flash');
            me.video = jwplayer($main.attr('id')).setup({
                file: $main.attr('data-src'),
                width: "100%",
                aspectratio: "16:9",
                controls: false,
            });
            me.video.setMute(false);
            me.subVideos = [];
            $ancilliary.each(function(i, e) {
                me.subVideos.push(jwplayer($(e).attr('id')).setup({
                    file: $(e).attr('data-src'),
                    width: "100%",
                    aspectratio: "16:9",
                    controls: false,
                }));
                me.subVideos[i].setMute(true);
            });
           
            // attach control bar and video handlers
            me.controlBarHandlers({
                play: function() { 
                    me.video.play(true); 
                    $.each(me.subVideos, function(i, v) { v.play(true); });
                },
                pause: function() { 
                    me.video.play(false); 
                    $.each(me.subVideos, function(i, v) { v.play(false); });
                },
                seek: function(time) { 
                    me.video.seek(time); 
                    $.each(me.subVideos, function(i, v) { v.seek(time); });
                },
                duration: function() { return me.video.getDuration(); },
                position: function() { return me.video.getPosition(); },
            });
            me.videoHandlers({
                duration: function() { return me.video.getDuration(); },
                swap: this.swapHandlers()[me.mode]
            });
            break;
    }
    me.processTimeUpdates(me.mode);

    // for canvas, start redrawing loop
    if (me.mode == "canvas") {
        me.redrawVideo(me.video);
    } 
    // for multisync videos, specify how to sync. should factor.
    else if (me.mode == "video" && !me.fullmode) {
        me.syncHTML5Videos();
    } 
    else if (me.mode == "flash" && !me.fullmode) {
        me.syncFlashVideos();
    }
    
    // for non sync'd single video mode, change CSS so video fills viewport
    if (me.fullmode) {
        $container.find('.video50-videos-wrapper').addClass('fullmode'); 
    }
    else {
        $container.find('.video50-videos-wrapper').removeClass('fullmode'); 
    }
    
    // resize videos
    $(window).trigger('resize');

    // wait until all videos ready, then start all the videos
    me.startVideos();
}

CS50.Video.prototype.startVideos = function(handlers) {
    var me = this;
    var $container = $(me.options.playerContainer).find('.video50-wrapper');
    switch (me.mode) {
        case "canvas":
        case "video":
            var loaded = 0;
            $('video').on('canplaythrough', function(e) {
                var length = me.options.currentVideo.length || 1;
                if (++loaded == length) {
                    // restore video playback state if it exists
                    if (me.state !== undefined) {
                        me.cbHandlers.seek(me.state.currentTime);
                    }
                    $container.find('.video50-play-pause-control').trigger('mousedown');
                }
            });
            break;
        case "flash":
            var loaded = 0;
            $.each([me.video].concat(me.subVideos), function(i, v) {
                v.onReady(function(e) {
                    var length = me.options.currentVideo.length || 1;
                    if (++loaded == length) {
                        // restore video playback state if it exists
                        if (me.state !== undefined) {
                            me.cbHandlers.seek(me.state.currentTime);
                        }
                        $container.find('.video50-play-pause-control').trigger('mousedown');
                    }
                });
            });
            break;
    }
}

/*
 *  Attaches all the basic handlers to implement basic functionality of the control bar for a
 *  a new mode of the player, by passing an object where the following operations on the video 
 *  are implemented.
 *  
 *  @param handlers Object video function handlers
 *      play: function, plays the current video
 *      pause: function, pauses the current video
 *      seek: function, @param time in seconds, seeks to timecode in the current video
 *      duration: function, returns the duration of the video
 *      position: function, returns the current playback time of the video 
 *      playbackRate: function, @param speed, alters the playback rate of the video
 */
CS50.Video.prototype.controlBarHandlers = function(handlers) {
    var me = this;
    var $container = $(me.options.playerContainer);
    
    // expose control bar handlers in case we have to use them manually
    me.cbHandlers = handlers;
    
    // XXX: test for required handlers

    // toggle play pause
    $container.on('mousedown.video50', '.video50-play-pause-control, .video50-main-video-wrapper', function() {
        var playPauseButton = $container.find('.video50-play-pause-control')
        if (playPauseButton.toggleClass('pause').hasClass('pause')) {
            handlers.pause();
        } 
        else {
            handlers.play();
        }
    });

    // seek around by clicking on the progress bar
    $container.on('mousedown.video50', '.video50-timeline', function(e) {
        var ratio = (e.pageX - $(this).offset().left)/$(this).width();
        handlers.seek(ratio * handlers.duration());
    });    
    
    // skip back 8 seconds when skip back control is hit
    $container.on('mousedown.video50', '.video50-sb-control', function(e) {
        var time = handlers.position() > 8 ? 0 : handlers.position() - 8;
        handlers.seek(time);
    });

    // skip forward 30 seconds when skip forward control is hit
    $container.on('mousedown.video50', '.video50-sf-control', function(e) {
        var time = handlers.position() + 30 > handlers.duration() ? handlers.duration() : handlers.position() + 30;
        handlers.seek(time);
    });

    // control the speed of video playback
    // XXX: remove player control if this option is not defined
    if (handlers.playbackRate !== undefined) {
        $container.on('mousedown.video50', '.video50-speed-control [data-rate]', function(e) {
            e.preventDefault();
            var speed = $(this).attr('data-rate');
            $container.find('.video50-curspeed').text(speed + "x");
            $(this).addClass('active').siblings().removeClass('active');
            handlers.playbackRate(speed);
        });
    }

    // toggle list controls in the control bar
    $container.on('mousedown.video50', '.video50-control-toggle', function(e) {
        var $child = $(this).find('.video50-control-list');
        $container.find('.video50-control-list').not($child).hide();
        $child.toggle();
    });    
    
    // prevent control bar clicks from pausing the main video (or propagating in general)
    $container.on('mousedown.video50', '.video50-control-bar', function(e) {
        e.stopPropagation();
    });
    
    // handle fading out of video controls after 3 second idle
    CS50.controlFade = undefined;
    $container.on('mousemove.video50', function(e) {
        clearTimeout(CS50.controlFade);
        $container.find('.video50-control-bar').fadeIn();
        CS50.controlFade = setTimeout(function() {
            $container.find('.video50-control-bar').fadeOut();
        }, 3000);
    });
    $container.trigger('mousemove');

    // request a native browser fullscreen, if possible
    $container.on('mousedown.video50', '.video50-fullscreen-control', function(e) { 
        var container = $container.find('.video50-main-video-wrapper')[0];
        if (!$(this).hasClass('active')) {
            if (container.requestFullscreen) {
              container.requestFullscreen();
            } else if (container.mozRequestFullScreen) {
              container.mozRequestFullScreen();
            } else if (container.webkitRequestFullscreen) {
              container.webkitRequestFullscreen();
            }
        }
        else {
            if (document.cancelFullscreen) {
              document.cancelFullscreen();
            } else if (document.mozCancelFullScreen) {
              document.mozCancelFullScreen();
            } else if (document.webkitCancelFullscreen) {
              document.webkitCancelFullscreen();
            }
        }
    });
   
    // handle DOM changes when a native browser fullscreen is initiated or cancelled
    $(document).on('webkitfullscreenchange.video50 mozfullscreenchange.video50 fullscreenchange.video50', function(e) {
        var container = $container.find('.video50-main-video-wrapper')[0];
        // element is being unfullscreened, so ...
        if (!document.fullscreenElement && !document.mozFullScreenElement && 
            !document.webkitFullscreenElement) {
            // ... move fullscreen controls back to the multivideo display
            $container.removeClass('fullscreen');
            $container.find('.video50-fullscreen-control').removeClass('active');
            $container.find('.video50-control-bar').appendTo($container);
        } 
        // element is being fullscreened, so ...
        else {
            // ... move fullscreen controls so they are part of fullscreened video
            $container.addClass('fullscreen');
            $container.find('.video50-fullscreen-control').addClass('active');
            $container.find('.video50-control-bar').appendTo($(container));
        }
    }); 
    
    // change the caption language, and change the caption download language
    $container.on('mousedown.video50', '.video50-captions-control [data-lang]', function(e) {
        e.preventDefault();
        var short = $(this).attr('data-lang');
        $container.find('.video50-transcript-download')
                    .text("SRT (" + CS50.Video.Languages[short]+ ")")
                    .attr('href', me.options.captions[short]);
        me.loadCaption(short);
    });

    $container.on('mousedown.video50', '.video50-quality-control [data-index]', function(e) {
        e.preventDefault();
   
        // grab the quality of the new video and the file path, updating the UI
        var i = $(this).attr('data-index');
        me.options.currentVideo = me.options.files[i];

        if (me.options.currentVideo instanceof Array)
            var quality = me.options.files[i][0].height;
        else
            var quality = me.options.files[i].singleHeight;

        // XXX: make UI options more clear...
        $container.find('.video50-curquality').text(quality + "p");
        $(this).addClass('active').siblings().removeClass('active');
        
        // save and restore state
        me.state = {
            currentTime: handlers.position()
        };

        me.createPlayer(); 
    });
};

/*
 *  Handles what to do in the case that a timeupdate event is received by the player.
 *  Separate from control bar method, because the event interfaces for each of the players
 *  do not match up (i.e. flash onTime and HTML5 timeupdate).
 *
 *  @param mode string the mode of the player, used to execute the correct actions
 */
CS50.Video.prototype.processTimeUpdates = function() {
    var me = this;
    var $container = $(me.options.playerContainer).find('.video50-wrapper');
   
    switch (me.mode) {
        case "canvas":
        case "video":
            // html5 timeupdate event
            $container.find('.video50-source-video').on('timeupdate.video50', function(e) {
                if (me.video.paused) {
                    $('.video50-ancilliary-videos .video50-video').trigger('timeupdate');
                }
            
                // update highlight on the transcript, update cc
                if (!this.lastUpdate || (this.lastUpdate + 500) < (new Date).getTime()) {
                    me.updateTranscriptHighlight(e.target.currentTime);
                    me.updateCC(e.target.currentTime);
                    me.updateTimeline(e.target.currentTime, me.video.duration);           
         
                    this.lastUpdate = (new Date).getTime();
                }
            });
            break;
        case "flash":
            // flash timeupdate event
            // XXX: probably want to use the main video after a swap...
            me.video.onTime(function(e) {
                // update highlight on the transcript, update cc
                if (!me.lastUpdate || (me.lastUpdate + 500) < (new Date).getTime()) {
                    me.updateTranscriptHighlight(e.position);
                    me.updateCC(e.position);
                    me.updateTimeline(e.position);           
                    me.lastUpdate = (new Date).getTime();
                }
            });
            break;
    }
}

CS50.Video.prototype.updateTimeline = function(time, total) {
    var me = this;
    var time = Math.floor(time);
    var total = Math.floor(total);
    var $container = $(this.options.playerContainer);
    var video = $container.find('.video50-source-video')[0];   

    // update the length
    if ($container.find('.video50-timelength').text() == "") {
        var m = Math.floor(total / 60);
        var s = total % 60;
        m = m < 10 ? "0" + m : m;
        s = s < 10 ? "0" + s : s;
        $container.find('.video50-timelength').text(m + ":" + s);   
    }

    // update the timecode
    var m = Math.floor(time / 60);
    var s = time % 60;
    m = m < 10 ? "0" + m : m;
    s = s < 10 ? "0" + s : s;
    $container.find('.video50-timecode').text(m + ":" + s);

    // update the length of the bar
    var ratio = time / total;
    $container.find('.video50-progress').css("width", (ratio * 100) + "%");
};

/*
 *  Draws a frame from the video to the canvases.
 */
CS50.Video.prototype.redrawVideo = function(video) {
    // for each canvas object, draw the appropriate segment onto the canvas
    var me = this;
    me.canvases.each(function(i, canvas) {
        var context = canvas.getContext('2d');
        var segment = canvas.getAttribute('data-segment');
        var rows = me.options.currentVideo.rows;
        var cols = me.options.currentVideo.cols;
        var height = me.options.currentVideo.singleHeight;
        var width = me.options.currentVideo.singleWidth;
        var y = Math.floor(segment / cols) * height;
        var x = (segment % cols) * width;
        context.drawImage(video, x, y, width, height, 0, 0, width, height);
    });

    // redraw the video at approximately 30fps
    me.timeout = setTimeout(function() { me.redrawVideo(video) }, 20);
};

// XXX: handle video syncing
CS50.Video.prototype.syncHTML5Videos = function() {
    var me = this;
    for (var i = 0; i < me.subVideos.length; i++) {
        if (me.subVideos[i].readyState === 4 && (Math.abs(me.subVideos[i].currentTime - me.video.currentTime) > .05)) {
            me.subVideos[i].currentTime = me.video.currentTime;
        }
    }
  
    webkitRequestAnimationFrame(function() {
        me.syncHTML5Videos();
    });
}

CS50.Video.prototype.syncFlashVideos = function() {
    var me = this;
    for (var i = 0; i < me.subVideos.length; i++) {
        if (me.subVideos[i].getState() !== "BUFFERING" && 
            (Math.abs(me.subVideos[i].getPosition() - me.video.getPosition()) > .3)) {
            me.subVideos[i].seek(me.video.getPosition());
        }
    }
  
    setTimeout(function() {
        me.syncFlashVideos();
    }, 100);
}

CS50.Video.prototype.swapHandlers = function() {
    var me = this;
    var $container = $(me.options.playerContainer).find('.video50-wrapper');
    
    return {
        canvas: function(el) {
            // simply swap the data-segment id of the two video canvases 
            var oldMain = $container.find('.video50-main-video-wrapper .video50-video')
                                    .attr('data-segment');
            var newMain = $(el).attr('data-segment');

            $container.find('.video50-main-video-wrapper .video50-video')
                      .attr('data-segment', newMain);
            
            $container.find('.video50-main-video-wrapper .video50-video')
                      .css('top', - newMain * $container.find('.video50-main-video-wrapper').height()); 

            $(el).attr('data-segment', oldMain);
        },
        video: function(el) {
            // swap the two dom elements and their classes
            var $oldMain = $container.find('.video50-main-video-wrapper .video50-video')
                                     .removeClass('video50-source-video');
            var $newMain = $(el).addClass('video50-source-video');
            $newMain.after($oldMain);
            $container.find('.video50-main-video-wrapper').prepend($newMain);

            // mute the old video and make the new video the sound source
            $oldMain.prop('muted', true);
            $newMain.prop('muted', false);

            // swap the video sources that the syncing code uses
            me.video = $container.find('.video50-source-video')[0];
            me.subVideos = $container.find('.video50-ancilliary-videos > video').get();
            
            // play the videos, since moving the DOM element pauses by default
            me.video.play();
            _.each(me.subVideos, function(video, index) {
                video.play();
            });

            // trigger a resize to attain the correct dimensions
            $(window).trigger('resize');
        },
        flash: function(el) {
            // swap the two dom elements and their classes
            var $oldMain = $container.find('.video50-main-video-wrapper .video50-video')
                                     .removeClass('video50-source-video');
            var $newMain = $(el).addClass('video50-source-video');
            $newMain.after($oldMain);
            $container.find('.video50-main-video-wrapper').prepend($newMain);

            // swap the video sources that the syncing code uses
            me.video = jwplayer($newMain.find('.video50-flash').attr('id'));
            me.subVideos = [];
            $container.find('.video50-flash').each(function(i, e) {
                me.subVideos.push(jwplayer($(e).attr('id')))
            });

            // mute the old video and make the new video the sound source
            me.video.setMute(false);
            jwplayer($oldMain.find('.video50-flash').attr('id')).setMute(true);

            // trigger a resize to attain the correct dimensions
            $(window).trigger('resize');
        }
    };
}

/*
 *  Attaches all the basic handlers to implement basic functionality of the video area for a
 *  a new mode of the player, by passing an object with the following properties defined.
 *  
 *  @param handlers Object video function handlers
 *      swap: function, executes behavior when video on right pane is clicked
 *      resize: function, executes behavior when window is resized
 */
CS50.Video.prototype.videoHandlers = function(handlers) {
    var me = this;
    var $container = $(me.options.playerContainer);
    
    // handle swapping of videos
    $container.on('mousedown.video50', '.video50-ancilliary-videos .video50-video', function(e) {
        handlers.swap(this);
    });

    // handle keypress changes on the video
    $container.on('keydown.video50', function(e) {
        switch(e.which) {
            case 49:
            case 50:
            case 51:
            case 52:
            case 53:
                // handle swapping the video with key numbers
                var segment = e.which - 49;
                var $video = $container.find('[data-segment=' + segment + ']');
                if ($video.closest('.video50-main-video-wrapper').length == 0)
                    $video.trigger('mousedown');
                break;
            case 32:
                $container.find('.video50-main-video-wrapper').trigger('mousedown');
                break;
            default:
                break;
        }
    });
    
    // handle the mouse on and off behavior of the video dragger
    var move = false;
    $container.on('mousedown.video50', '.video50-dragger', function(e) {
        move = true;
    })
    
    $(document).on('mouseup.video50', function(e) {
        move = false;
    });
   
    $(document).on('mousemove.video50', function(e) {
        if (move) {
            me.resizeMultistream(e.pageX - $container[0].offsetLeft);
        }
    });
    
    // default position of the dragger, and % of the container's
    // viewport width taken up by the larger video
    me.containerX = me.containerX || (.65 * $container.width());
    me.oldRatio = me.oldRatio || .65;
    
    // resize the video whenever the container has the possibility of being resized
    // XXX: turn off resizing if a resizing handler is not defined
    $(window).on('resize.video50', function() {
        // recalcuate correct position of dragger based on old video ratio
        // XXX: handler.resize();
        var newX = me.oldRatio * $container.width();
        me.resizeMultistream(newX);
    });
};

// Given a desired keystone width (i.e. the apparent width of the container when keystoned),
// the angle of keystoning, and the z distance from the plane, returns the original width of
// the container needed to achieve such a keystone width.
CS50.Video.prototype.reverseKeystone = function(desired, angle, z) {
    var a = angle / 360.0 * Math.PI;
    return (z * desired)/(z * Math.cos(a) - desired * Math.sin(a));
}
   
// resizes the videos appropriately and positions the dragger at dividing point = x
// XXX: handle resizing of player
CS50.Video.prototype.resizeMultistream = function(x) {
    var me = this;
    var $container = $(me.options.playerContainer).find('.video50-wrapper');
    
    // do not allow main video to become smaller than 50% of viewport
    var ratio = x/$container.width();
    if (ratio < .5)
        return;
  
    // do not allow ancilliary video to become smaller than 200px wide
    if ($container.width() - x < 200)
        return;

    // else, update our resizing variables to reflect new state
    me.containerX = x;
    me.oldRatio = ratio;

    // update the position of the slider
    if ($container.find('.video50-videos-wrapper').hasClass("fullmode")) {
        $container.find('.video50-left').css('width', $container.width()); 
    }
    else {
        $container.find('.video50-left').css('width', x);
    }

    $container.find('.video50-right').css('left', x + 1);
    $container.find('.video50-dragger').css('left', x + 1);
 
    // calculate and invoke keystoning for ancilliary videos
    var degreeRight = ratio <= .6 ? 0 : (.6 - ratio) * 45;
    var drStr = "rotateY(" + degreeRight + "deg)";
    $container.find('.video50-ancilliary-videos > .video50-video').css({
        "-webkit-transform": drStr,
        "-moz-transform": drStr,
        "-ms-transform": drStr,
        "-o-transform": drStr,
        "transform": drStr,
    });

    // calculate new widths that will result in keystone widths fititng in containers
    var mvWidth = $container.find('.video50-main-video-wrapper').width();
    var mvHeight = mvWidth * 9.0/16.0;
    var ovWidth = me.reverseKeystone($container.find('.video50-ancilliary-videos').width(), -degreeRight, 200);
    var ovHeight = ovWidth * 9.0/16.0;

    // change the height of the main video wrapper for overflow or sizing
    $container.find(".video50-main-video-wrapper").css({
        height: mvHeight
    });
    
    // make the height for canvasing auto, so we can clip with overflow
    var $main = $container.find('.video50-main-video-wrapper > .video50-video');
    var top = (me.mode === "canvas") ? -mvHeight * $main.attr('data-segment') : "0px";
    var height = (me.mode === "canvas") ? "auto" : mvHeight;
    $main.css({
        width: mvWidth,
        height: height,
        top: top
    });
    $container.find(".video50-ancilliary-videos > .video50-video").css({
        width: ovWidth,
        height: ovHeight
    });

    // vertical centering for the containers
    $container.find('.video50-main-video-wrapper')
              .css('margin-top', -$container.find('.video50-main-video-wrapper').height()/2);
    $container.find('.video50-ancilliary-videos')
              .css('margin-top', -$container.find('.video50-ancilliary-videos').height()/2);
}

/*
 *  Updates the closed captioning for the video player.
 */
CS50.Video.prototype.updateCC = function(time) {
    var time = Math.floor(time);
    var $container = $(this.options.playerContainer);
    var $active = $container.find('.video50-transcript-container [data-time="' + time + '"]');
    var $text = $container.find('.video50-cc-text');

    // if current CC is not correct
    if ($active.length && $text.attr('data-time') != time) {
        $text.text($active.text());
    }  
};

/**
 * Highlight the line corresponding to the current point in the video in the transcript
 *
 */
CS50.Video.prototype.updateTranscriptHighlight = function(time) {
    var time = Math.floor(time);
    var $container = $(this.options.playerContainer).find('.video50-transcript-container');
    var $active = $container.find('[data-time="' + time + '"]');

    // check if a new element should be highlighted
    if ($active && $active.length) {
        // remove all other highlights
        $container.find('a').removeClass('highlight');

        // add highlight to active element
        $active.addClass('highlight');
    }
};

/**
 * Load the specified caption file.
 *
 * @param lang Language to load
 *
 */
CS50.Video.prototype.loadCaption = function(language) {
    var player = this.player;
    var me = this;

    if (this.options.captions[language]) {
        $.get(this.options.captions[language], function(response) {
            var timecodes = response.split(/\n\s*\n/);

            // if transcript container is given, then build transcript
            if (_.keys(me.options.captions).length) {
                // clear previous text
                var $container = $(me.options.playerContainer).find('.video50-transcript-container');
                
                // look for a previous caption if already active, keep the timecode
                var oldTime = $container.find('.highlight[data-time]').attr('data-time');
                $container.empty();

                // iterate over each timecode
                var n = timecodes.length;
                for (var i = 0; i < n; i++) {
                    // split the elements of the timecode
                    var timecode = timecodes[i].split("\n");
                    if (timecode.length > 1) {
                        // extract time and content from timecode
                        var timestamp = timecode[1].split(" --> ")[0];
                        timecode.splice(0, 2);
                        var content = timecode.join(" ");

                        // if line starts with >> or [, then start a new line
                        if (content.match(/^(>>|\[)/))
                            $container.append('<br /><br />');

                        // convert from hours:minutes:seconds to seconds
                        var time = timestamp.match(/(\d+):(\d+):(\d+)/);
                        var seconds = parseInt(time[1], 10) * 3600 + parseInt(time[2], 10) * 60 + parseInt(time[3], 10);

                        // add line to transcript
                        $container.append('<a href="#" data-time="' + seconds + '">' + content + '</a> ');
                    }
                }

                // if there was a previously active timecode, update cc and highlight
                if (oldTime) {
                    var time = { position: oldTime };
                    me.updateCC(time);
                    me.updateTranscriptHighlight(time);
                }
            }
        });
    }
};

/*
 *  Detects whether the player can play a particular file, given a file format.
 *  @param format to test for support (e.g. video/mp4, video/webm)
 */
CS50.Video.prototype.supportsFormat = function(format) {
    switch (format) {
        case "video/mp4":
            return this.options.supportsMP4;
        case "video/webm":
            return this.options.supportsWebM;
    }
};
