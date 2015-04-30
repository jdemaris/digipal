(function($) {

    TextViewer = window.TextViewer || {};
    
    //////////////////////////////////////////////////////////////////////
    //
    // PanelSet
    //
    //////////////////////////////////////////////////////////////////////
    var PanelSet = TextViewer.PanelSet = function($root) {
        this.panels = [];
        this.$root = $root;
        this.$panelset = null;
        this.layout = null;
        this.$messageBox = null;
        this.isReady = false;
        
        this.registerPanel = function(panel) {
            this.panels.push(panel);
            panel.panelSet = this;
            panel.setItemPartid(this.itemPartid);
            if (this.isReady) {
                panel.componentIsReady('panelset');
            }
        };
        
        this.unRegisterPanel = function(panel) {
            for (var i in this.panels) {
                if (this.panels[i] == panel) {
                    this.panels.splice(i, 1);
                }
            }
        };
        
        this.onPanelContentLoaded = function(panel, locationType, location) {
            for (var i in this.panels) {
                this.panels[i].syncLocationWith(panel, locationType, location);
            }
        };
        
        this.setItemPartid = function(itemPartid) {
            // e.g. '/itemparts/1/'
            this.itemPartid = itemPartid;
        };

        this.setLayout = function($panelset) {
            this.$panelset = $panelset;
            var me = this;
            var resize = function() { me._resizePanels(); };
            this.layout = $panelset.layout({ 
                applyDefaultStyles: true,
                closable: true,
                resizable: true,
                slidable: true,
                livePaneResizing: true,
                onopen: resize,
                onclose: resize,
                onshow: resize,
                onhide: resize,
                onresize: resize
            });
        };
        
        // Change the relative size of the panel
        // panelLocation: west|north|south|east
        // size: a ratio. e.g. 1/2.0 for half the full length
        this.setPanelSize = function(panelLocation, size) {
            if (size == 0) {
                this.layout.close(panelLocation);
            } else {
                var fullLength = this.$panelset[(panelLocation == 'east' || panelLocation == 'west') ? 'width': 'height']();
                this.layout.open(panelLocation);
                this.layout.sizePane(panelLocation, size * fullLength);
            }
        }

        this.setMessageBox = function($messageBox) {
            this.$messageBox = $messageBox;
        };

        this.setExpandButton = function($expandButton) {
            this.$expandButton = $expandButton;
            var me = this;
            this.$expandButton.on('click', function() { me.$panelset.css('height', $(window).height()); return true; });
        };

        this._resize = function(refreshLayout) {
            // resize the div to the available height on the browser viewport
            var window_height = $(window).height();
            var height = window_height - this.$root.offset().top + $(document).scrollTop();
            height = (height < 1) ? 0 : height;
            height = (height > window_height) ? window_height : height;
            this.$panelset.css('height', height - this.$messageBox.outerHeight(true));
            
            if (refreshLayout && this.layout) {
                this.layout.resizeAll();
            }
            
            this._resizePanels();
        };
        
        this._resizePanels = function() {
            for (var i in this.panels) {
                this.panels[i].onResize();
            }
        }

        this.initEvents = function() {
            
            this._resize(true);
            var me = this;
            
            $(window).resize(function() { 
                me._resize();
                });
            $(window).scroll(function() { 
                me._resize(true);
                });
        };
        
        this.ready = function() {
            this.initEvents();
            for (var i in this.panels) {
                this.panels[i].componentIsReady('panelset');
            }
            this.isReady = true;
        };
        
    };
    
    /////////////////////////////////////////////////////////////////////////
    // Panel: an abstract Panel managed by the panelset
    // This is the base class for all specific panel types (e.g. text, image)
    // It provides some basic behaviour for auto-resizing, loading/saving content
    //
    // Usage:
    //    var panelset = $('#text-viewer').panelset();
    //    panelset.registerPanel(new Panel($('.ui-layout-center')));
    //
    /////////////////////////////////////////////////////////////////////////
    var Panel = TextViewer.Panel = function($root, contentType, panelType) {
        this.$root = $root;
        
        // we set a ref from the root element to its panel 
        // so we can clean up things properly when the panel is replaced
        if ($root[0].textViewerPanel) {
            $root[0].textViewerPanel.onDestroy();
        }
        this.$root[0].textViewerPanel = this;
        
        this.panelType = panelType;
        this.contentType = contentType;
        
        this.panelSet = null;
        
        // loaded is the location of the last successfully loaded text fragment
        // content cannot be saved unless it has been loaded properly
        // This is to avoid a loading error from erasing conent.
        // On a load error the location may still be valid and the next
        // attempt to save will overwrite the fragment.
        this.loadedAddress = null;

        // clone the panel template
        var $panelHtml = $('#text-viewer-panel').clone();
        $panelHtml.removeAttr('id');
        $panelHtml.addClass('ct-'+contentType);
        $panelHtml.addClass('pt-'+panelType.toLowerCase());
        this.$root.html($panelHtml);
        
        // We create bindings for all the html controls on the panel
        
        this.$contentTypes = this.$root.find('.dropdown-content-type');
        
        this.$locationTypes = this.$root.find('.dropdown-location-type');
        this.$locationSelect = this.$root.find('select[name=location]');
        this.$root.find('select').each(function() {
            $(this).chosen({disable_search: $(this).hasClass('no-search')});
        });
        
        this.$content = this.$root.find('.panel-content');
        this.$statusBar = this.$root.find('.status-bar');
        
        this.$statusSelect = this.$root.find('select[name=status]');
        
        this.$toggleEdit = this.$root.find('.toggle-edit');
        
        
        // METHODS
        
        this.callApi = function(title, url, onSuccess, requestData, synced) {
            var me = this;
            var onComplete = function(jqXHR, textStatus) {
                if (textStatus !== 'success') {
                    me.setMessage('Error while '+title+' (status: '+textStatus+')', 'error');
                }
            };
            var onSuccessWrapper = function(data, textStatus, jqXHR) {
                data.status = data.status || 'success';
                data.message = data.message || 'done ('+title+').';
                if (data.locations) {
                    me.updateLocations(data.locations);
                }
                if (data.status === 'success') {
                    onSuccess(data, textStatus, jqXHR);
                }
                me.setMessage(data.message, data.status);
            };
            this.setMessage(title+'...', 'info');
            var ret = TextViewer.callApi(url, onSuccessWrapper, onComplete, requestData, synced);
            return ret;
        } 
        
        this.onDestroy = function() {
            // destructor, the place to remove any resource and detach event handlers
            this.panelSet.unRegisterPanel(this);
            // prevent ghost saves (e.g. detached panel still listens to unload events)
            this.setNotDirty();
            this.loadedAddress = null;
        };
        
        this.onResize = function () {
            // resize content to take the remaining height in the panel
            var height = this.$root.innerHeight() - (this.$content.offset().top - $root.offset().top) - this.$statusBar.outerHeight(true);
            this.$content.css('max-height', height+'px');
            this.$content.height(height+'px');
        };
        
        this.setMessage = function(message, status) {
            // status = success|info|warning|error
            this.$statusBar.find('.message').html(message).removeClass('message-success message-info message-warning message-error').addClass('message-'+status);
            this.$statusBar.find('.time').html(TextViewer.getStrFromTime(new Date()));
        };
                
        this.unreadyComponents = ['panelset'];
        
        this.componentIsReady = function(component) {
            // we remove the component from the waiting list
            var index = $.inArray(component, this.unreadyComponents);
            if (index > -1) {
                this.unreadyComponents.splice(index, 1);
            }
            // if the waiting list is empty, we call _ready()
            if (this.unreadyComponents.length == 0) {
                this._ready();
            } 
        };
        
        this._ready = function() {
            var me = this;
            
            this.updateEditingModeIcon();
            
            this.$contentTypes.dpbsdropdown({
                onSelect: function($el, key, $a) {
                    // the user has selected another view/content type -> we replace this panel
                    me.panelSet.registerPanel(new TextViewer['Panel'+$a.data('class')](me.$root, key));
                },
            });
            this.$contentTypes.dpbsdropdown('setOption', this.contentType, true);

            this.loadContent(true);
            
            this.onResize();

            this.$locationTypes.dpbsdropdown({
                onSelect: function($el, key) { me.onSelectLocationType(key); },
            });
            // fire onSelect event as we want to refresh the list of locations
            //this.$locationTypes.dpbsdropdown('onSelect');
            
            this.$statusSelect.on('change', function() {
                // digipal/api/textcontentxml/?_text_content__item_part__id=1628&_text_content__type__slug=translation&status__id=7
                var ret = TextViewer.callApi('/digipal/api/textcontentxml/', null, null, {
                    'method': 'PUT', 
                    '_text_content__item_part__id': me.itemPartid,
                    '_text_content__type__slug': me.getContentType(),
                    'status__id': $(this).val(),
                    '@select': 'id'
                });
            });

            this.$locationSelect.on('change', function() {
                me.loadContent();
            });

            setInterval(function() {
                me.saveContent();
            }, 2500);
        };
        
        this.syncLocationWith = function(panel, locationType, location) {
            if ((panel !== this) && (this.getLocationType() === 'sync') && (this.getLocation().toLowerCase() == panel.getContentType().toLowerCase())) {
                this.loadContent(false, this.getContentAddress(locationType, location));
            }
        };
        
        /*
         * Loading and saving
         * 
         * General rules about when the content should be saved:
         *      at regular interval (this class)
         *      when the editor loses the focus (subclass)
         *      before the window/tab/document is closed (subclass)
         * but
         *      only if the content has been changed (this.isDirty() and this.getContentHash())
         *      only if the content has been loaded properly (this.loadedAddress <> null)
         */
        
        /* LOADING CONTENT */

        this.loadContent = function(loadLocations, address) {
            address = address || this.getContentAddress();
            
            if (this.loadedAddress != address) {
                this.setValid(false);
                // make sure no saving happens from now on
                // until the content is loaded
                this.loadedAddress = null;
                this.loadContentCustom(loadLocations, address);
            }
        };
        
        this.loadContentCustom = function(loadLocations, address) {
            // NEVER CALL THIS FUNCTION DIRECTLY
            // ONLY loadContent() can call it
            this.$content.html('Generic Panel Content');
            this.onContentLoaded();
        };
        
        /* SAVING CONTENT */
        
        this.saveContent = function(options) {
            options = options || {};
            if (this.loadedAddress && (this.isDirty() || options.forceSave)) {
                console.log('SAVE '+this.loadedAddress);
                this.setNotDirty();
                this.saveContentCustom(options);
            }
        }
        
        this.saveContentCustom = function(options) {
            // NEVER CALL THIS FUNCTION DIRECTLY
            // ONLY saveContent() can call it
        }
        
        this.onContentSaved = function(data) {
        }

        /* -------------- */
        
        this.setValid = function(isValid) {
            // tells us if the content is invalid
            // if it is invalid we have to block editing
            // visually inform the user the content is not valid.
            var $mask = this.$root.find('.mask');
            if ($mask.length == 0) {
                // TODO: move this HTML to the template.
                // Not good practice to create it with JS
                this.$content.prepend('<div class="mask"></div>');
                $mask = this.$root.find('.mask');
            }

            $mask.css('height', isValid ? '0' : '100%');
        }

        this.isDirty = function() {
            var ret = (this.getContentHash() !== this.lastSavedHash);
            return ret;
        }

        this.setNotDirty = function() {
            this.lastSavedHash = this.getContentHash();
        }

        this.setDirty = function() {
            var d = new Date();
            this.lastSavedHash = (d.toLocaleTimeString() + d.getMilliseconds());
        }
        
        this.getContentHash = function() {
            var ret = null;
            return ret;
            //return ret.length + ret;
        }
        
        // Content Status
        this.setStatusSelect = function(contentStatus) {
            if (contentStatus) {
                // select the given status in the drop down
                this.$statusSelect.val(contentStatus);
                this.$statusSelect.trigger('liszt:updated');
            }
            // hide (chosen) select if no status supplied
            this.$statusSelect.closest('li').toggle(!!contentStatus);
        }
        
        // Address / Locations

        this.updateLocations = function(locations) {
            // Update the location drop downs from a list of locations
            // received from the server.
            
            if (locations) {
                //locations['sync'] = ['Transcription', 'Translation', 'Image', 'Codicology']
                locations['sync'] = this.$contentTypes.dpbsdropdown('getLabels');
                
                // save the locations
                this.locations = locations;

                // only show the available location types
                var locationTypes = [];
                for (var j in locations) {
                    locationTypes.push(j);
                }
                
                this.$locationTypes.dpbsdropdown('showOptions', locationTypes);
                this.$locationTypes.dpbsdropdown('setOption', locationTypes[0]);
                this.$locationTypes.closest('li').show();
            }
        };

        this.onSelectLocationType = function(locationType) {
            // update the list of locations
            var htmlstr = '';
            if (this.locations && this.locations[locationType]) {
                $(this.locations[locationType]).each(function (index, value) {
                    htmlstr += '<option value="'+value+'">'+value+'</option>';
                });
            }
            this.$locationSelect.html(htmlstr);
            this.$locationSelect.trigger('liszt:updated');
            this.$locationSelect.closest('li').toggle(htmlstr ? true : false);
            if (!htmlstr) { this.loadContent(); };
        };
        
        this.setItemPartid = function(itemPartid) {
            // e.g. '/itemparts/1/'
            this.itemPartid = itemPartid;
        };

        this.getContentAddress = function(locationType, location) {
            return '/digipal/manuscripts/' + this.itemPartid + '/texts/' + this.getContentType() + '/' + (locationType || this.getLocationType()) + '/' + encodeURIComponent((location === undefined) ? this.getLocation() : location) + '/';
        };
        
        this.getContentType = function() {
            return this.contentType;
        };

        this.setLocationTypeAndLocation = function(locationType, location) {
            // this may trigger a content load
            if (this.getLocationType() !== 'sync') {
                this.$locationTypes.dpbsdropdown('setOption', locationType);
                if (this.$locationSelect.val() != location) {
                    this.$locationSelect.val(location);
                    this.$locationSelect.trigger('liszt:updated');
                    this.$locationSelect.trigger('change');
                }
            }
        };
        
        this.getLocationType = function() {
            var ret = 'default';
            if (this.$locationTypes.is(':visible')) {
                ret = this.$locationTypes.dpbsdropdown('getOption');
            }
            return ret;
        };

        this.getLocation = function() {
            var ret = '';
            if (this.$locationSelect.next().is(':visible')) {
                ret = this.$locationSelect.val();
            }
            return ret;
        };
        
        this.getEditingMode = function() {
            // returns:
            //  undefined: no edit mode at all
            //  true: editing
            //  false: not editing
            return undefined;
        };
        
        this.updateEditingModeIcon = function() {
            if (this.$toggleEdit) {
                var mode = this.getEditingMode();
                
                this.$toggleEdit.toggleClass('dphidden', !((mode === true) || (mode === false)));
                
                this.$toggleEdit.find('a').toggleClass('active', (mode === true));
                
                this.$toggleEdit.find('a').attr('title', (mode === true) ? 'Preview the text' : 'Edit the text');
                
                this.$toggleEdit.find('a').tooltip();
                
                var me = this;
                this.$toggleEdit.find('a').on('click', function() {
                    me.panelSet.registerPanel(new TextViewer['PanelText'+(mode ? '' : 'Write')](me.$root, me.getContentType()));
                    return false;
                });
            }
        };
        
    };
    
    Panel.prototype.onContentLoaded = function(data) {
        //this.setMessage('Content loaded.', 'success');
        // TODO: update the current selections in the location dds
        // TODO: make sure no event is triggered while doing that
        
        this.loadedAddress = this.getContentAddress(data.location_type, data.location);
        this.setNotDirty();
        this.setValid(true);
        
        // update the location drop downs
        this.setLocationTypeAndLocation(data.location_type, data.location);

        // update the status
        this.setStatusSelect(data.content_status);
        
        // send signal to other panels so they can sync themselves
        this.panelSet.onPanelContentLoaded(this, data.location_type, data.location);
    };
    
    Panel.create = function(contentType, selector, write) {
        var panelType = contentType.toUpperCase().substr(0, 1) + contentType.substr(1, contentType.length - 1);
        //if ($.inArray('Panel'+panelType+(write ? 'Write': ''), TextViewer) === -1) {
        var constructor = TextViewer['Panel'+panelType+(write ? 'Write': '')] || TextViewer['PanelText'+(write ? 'Write': '')];
        return new constructor($(selector), contentType);
    };
    
    //////////////////////////////////////////////////////////////////////
    //
    // PanelText
    //
    //////////////////////////////////////////////////////////////////////
    var PanelText = TextViewer.PanelText = function($root, contentType) {
        TextViewer.Panel.call(this, $root, contentType, 'Text');

        this.getEditingMode = function() {
            return false;
        };
        
        this.loadContentCustom = function(loadLocations, address) {
            // load the content with the API
            var me = this;
            this.callApi(
                'loading content',
                address,
                function(data) {
                    if (data.content !== undefined) {
                        me.onContentLoaded(data);
                    } else {
                        //me.setMessage('ERROR: no content received from server.');
                    }
                },
                {
                    'load_locations': loadLocations ? 1 : 0,
                }
            );
        };
        
    };
    
    PanelText.prototype = Object.create(Panel.prototype);
    
    PanelText.prototype.onContentLoaded = function(data) {
        this.$content.addClass('mce-content-body').addClass('preview');
        this.$content.html(data.content);
        Panel.prototype.onContentLoaded.call(this, data);
    };
    
    //////////////////////////////////////////////////////////////////////
    //
    // PanelTextWrite
    //
    //////////////////////////////////////////////////////////////////////
    TextViewer.textAreaNumber = 0;
    
    var PanelTextWrite = TextViewer.PanelTextWrite = function($root, contentType) {
        TextViewer.PanelText.call(this, $root, contentType, 'Text');
        
        this.unreadyComponents.push('tinymce');
        
        this.getEditingMode = function() {
            return true;
        };

        // TODO: fix with 'proper' prototype inheritance
        this._baseReady = this._ready;
        this._ready = function() {
            var ret = this._baseReady();
            var me = this;
            
            $(this.tinymce.editorContainer).on('psconvert', function() {
                // mark up the content
                // TODO: make sure the editor is read-only until we come back
                me.saveContent({forceSave: true, autoMarkup: true});
            });
            
            $(this.tinymce.editorContainer).on('pssave', function() {
                // mark up the content
                // TODO: make sure the editor is read-only until we come back
                me.saveContent({forceSave: true, saveCopy: true});
            });

            // make sure we save the content if tinymce looses focus or we close the tab/window
            this.tinymce.on('blur', function() {
                me.saveContent();
            });

            $(window).bind('beforeunload', function() {
                me.saveContent({synced: true});
            });
            
            return ret;
        };

        // TODO: fix with 'proper' prototype inheritance
        this.baseOnResize = this.onResize;
        this.onResize = function () {
            this.baseOnResize();
            if (this.tinymce) {
                // resize tinmyce to take the remaining height in the panel
                var $el = this.$root.find('iframe');
                var height = this.$content.innerHeight() - ($el.offset().top - this.$content.offset().top);
                $el.height(height+'px');
            }
        };
        
        this.getContentHash = function() {
            var ret = this.tinymce.getContent();
            return ret;
            //return ret.length + ret;
        };

        this.saveContentCustom = function(options) {
            // options:
            // synced, autoMarkup, saveCopy
            var me = this;
            this.callApi(
                'saving content',
                this.loadedAddress, 
                function(data) {
                    //me.tinymce.setContent(data.content);
                    me.onContentSaved(data);
                    if (options.autoMarkup) {
                        me.tinymce.setContent(data.content);
                        me.setNotDirty();
                    }
                },
                {
                    'content': me.tinymce.getContent(), 
                    'convert': options.autoMarkup ? 1 : 0, 
                    'save_copy': options.saveCopy ? 1 : 0,
                    'method': 'POST',
                },
                options.synced
                );
        };

        this.initTinyMCE = function() {
            TextViewer.textAreaNumber += 1;
            var divid = 'text-area-' + TextViewer.textAreaNumber;
            this.$content.append('<div id="'+ divid + '"></div>');
            var me = this;

            var options = {
                skin : 'digipal',
                selector: '#' + divid,
                init_instance_callback: function() {
                    me.tinymce = tinyMCE.get(divid);
                    me.componentIsReady('tinymce');
                },
                plugins: ['paste', 'code', 'panelset'],
                toolbar: 'psclear undo redo pssave | psconvert | psclause | pslocation | psex pssupplied psdel | code ',
                paste_word_valid_elements: 'i,em,p,span',
                paste_postprocess: function(plugin, args) {
                    //args.node is a temporary div surrounding the content that will be inserted
                    //console.log($(args.node).html());
                    //$(args.node).html($(args.node).html().replace(/<(\/?)p/g, '<$1div'));
                    //console.log($(args.node).html());
                },
                menubar : false,
                statusbar: false,
                height: '15em',
                content_css : "/static/digipal_text/viewer/tinymce.css?v=3"
            };
            
            if (this.contentType == 'codicology') {
                options['toolbar'] = 'psclear undo redo | pslocation | psh1 psh2 | pspgside pspgdimensions pspgcolour | pshand | code';
                options['paste_as_text'] = true;
                options['paste_postprocess'] = function(plugin, args) {
                    //args.node is a temporary div surrounding the content that will be inserted
                    //console.log($(args.node).html());
                    //$(args.node).html($(args.node).html().replace(/<(\/?)p/g, '<$1div'));
                    //console.log($(args.node).html());
                    //console.log(args.node);
                    
                    // remove all tags except <p>s
                    var content = $(args.node).html();
                    content = content.replace(/<(?!\/?p(?=>|\s.*>))\/?.*?>/gi, '');
                    // remove attributes from all the elements
                    content = content.replace(/<(\/?)([a-z]+)\b[^>]*>/gi, '<$1$2>');
                    // remove nbsp;
                    content = content.replace(/&nbsp;/gi, '');
                    // remove empty elements
                    content = content.replace(/<[^>]*>\s*<\/[^>]*>/gi, '');
                    $(args.node).html(content);
                };
            }
            
            tinyMCE.init(options);
            
        };
        
        this.initTinyMCE();
    };

    PanelTextWrite.prototype = Object.create(PanelText.prototype);

    PanelTextWrite.prototype.onContentLoaded = function(data) {
        this.tinymce.setContent(data.content);
        this.tinymce.focus();
        this.tinymce.undoManager.clear();
        this.tinymce.undoManager.add();
        // We skip PanelText
        Panel.prototype.onContentLoaded.call(this, data);
    };

    //////////////////////////////////////////////////////////////////////
    //
    // PanelImage
    //
    //////////////////////////////////////////////////////////////////////
    var PanelImage = TextViewer.PanelImage = function($root, contentType) {

        Panel.call(this, $root, contentType, 'Image');

        this.loadContentCustom = function(loadLocations, address) {
            // load the content with the API
            var me = this;
            this.callApi(
                'loading image',
                address, 
                function(data) {
                    me.$content.html(data.content).find('img').load(function() {
                        me.onContentLoaded(data);
                    });
                },
                {
                    'layout': 'width',
                    'width': me.$content.width(),
                    'height': me.$content.height(),
                    'load_locations': loadLocations ? 1 : 0,
                }
            );
        };
    };
    
    PanelImage.prototype = Object.create(Panel.prototype);

    //////////////////////////////////////////////////////////////////////
    //
    // PanelNavigator
    //
    //////////////////////////////////////////////////////////////////////
    var PanelNavigator = TextViewer.PanelNavigator = function($root, contentType) {
        TextViewer.Panel.call(this, $root, contentType);
    };
    
    //////////////////////////////////////////////////////////////////////
    //
    // PanelNavigator
    //
    //////////////////////////////////////////////////////////////////////
    var PanelNavigator = TextViewer.PanelNavigator = function($root, contentType) {
        TextViewer.Panel.call(this, $root, contentType);
    };
    
    //////////////////////////////////////////////////////////////////////
    //
    // PanelXmlelement
    //
    //////////////////////////////////////////////////////////////////////
    var PanelXmlelementWrite = TextViewer.PanelXmlelementWrite = function($root, contentType) {
        TextViewer.Panel.call(this, $root, contentType);
    }
        
    //////////////////////////////////////////////////////////////////////
    //
    // Utilities
    //
    //////////////////////////////////////////////////////////////////////
    TextViewer.callApi = function(url, onSuccess, onComplete, requestData, synced) {
        // See http://stackoverflow.com/questions/9956255.
        // This tricks prevents caching of the fragment by the browser.
        // Without this if you move away from the page and then click back
        // it will show only the last Ajax response instead of the full HTML page.
        url = url ? url : '';
        var url_ajax = url + ((url.indexOf('?') === -1) ? '?' : '&') + 'jx=1';
        
        var getData = {
            url: url_ajax, 
            data: requestData, 
            async: (synced ? false : true), 
            complete: onComplete,
            success: onSuccess
        };
        if (requestData && requestData.method) {
            getData.type = requestData.method;
            delete requestData.method;
        }
        var ret = $.ajax(getData);
        
        return ret;
    }
    
    TextViewer.getStrFromTime = function(date) {
        date = date || new Date();
        var parts = [date.getHours(), date.getMinutes(), date.getSeconds()];
        for (var i in parts) {
            if ((i > 0) && (parts[i] < 10)) {parts[i] = '0' + parts[i]};
        }
        return parts.join(':');
    }

    // These are external init steps for JSLayout
    function initLayoutAddOns() {
        //
        //  DISABLE TEXT-SELECTION WHEN DRAGGING (or even _trying_ to drag!)
        //  this functionality will be included in RC30.80
        //
        $.layout.disableTextSelection = function(){
            var $d  = $(document)
            ,   s   = 'textSelectionDisabled'
            ,   x   = 'textSelectionInitialized'
            ;
            if ($.fn.disableSelection) {
                if (!$d.data(x)) // document hasn't been initialized yet
                    $d.on('mouseup', $.layout.enableTextSelection ).data(x, true);
                if (!$d.data(s))
                    $d.disableSelection().data(s, true);
            }
        };
        $.layout.enableTextSelection = function(){
            var $d  = $(document)
            ,   s   = 'textSelectionDisabled';
            if ($.fn.enableSelection && $d.data(s))
                $d.enableSelection().data(s, false);
        };
    
        var $lrs = $(".ui-layout-resizer");
        
        // affects only the resizer element
        // TODO: GN - had to add this condition otherwise the function call fails.
        if ($.fn.disableSelection) {
            $lrs.disableSelection();
        }
        
        $lrs.on('mousedown', $.layout.disableTextSelection ); // affects entire document
    };
    
    initLayoutAddOns();
    
    // TODO: move to dputils.js
    
    // See https://docs.djangoproject.com/en/1.7/ref/contrib/csrf/#ajax
    // This allows us to POST with Ajax
    function csrfSafeMethod(method) {
        // these HTTP methods do not require CSRF protection
        return (/^(GET|HEAD|OPTIONS|TRACE)$/.test(method));
    }
    function sameOrigin(url) {
        // test that a given url is a same-origin URL
        // url could be relative or scheme relative or absolute
        var host = document.location.host; // host + port
        var protocol = document.location.protocol;
        var sr_origin = '//' + host;
        var origin = protocol + sr_origin;
        // Allow absolute or scheme relative URLs to same origin
        return (url == origin || url.slice(0, origin.length + 1) == origin + '/') ||
            (url == sr_origin || url.slice(0, sr_origin.length + 1) == sr_origin + '/') ||
            // or any other URL that isn't scheme relative or absolute i.e relative.
            !(/^(\/\/|http:|https:).*/.test(url));
    }
    $.ajaxSetup({
        beforeSend: function(xhr, settings) {
            if (!csrfSafeMethod(settings.type) && sameOrigin(settings.url)) {
                // Send the token to same-origin, relative URLs only.
                // Send the token only if the method warrants CSRF protection
                // Using the CSRFToken value acquired earlier
                xhr.setRequestHeader("X-CSRFToken", dputils.getCookie('csrftoken'));
            }
        }
    });
    
}( jQuery ));
