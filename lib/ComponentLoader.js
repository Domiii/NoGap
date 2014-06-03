/**
 * The ComponentLoader initializes everything on the host side and then prepares things for the client.
 * In the end, it calls relies on ComponentBootstrap to deploy the client-side of the component.
 */
"use strict";

var url = require('url');
var path = require('path');
var fs = require('fs');

var ComponentDef = require('./ComponentDef');
var ComponentBootstrap = require('./ComponentBootstrap');
var ComponentCommunications = require('./ComponentCommunications');

// add basic asset management
require('./Assets');

// add all kinds of other component-related managers
require('./ComponentTools');
require('./ComponentContext');
require('./ComponentSession');
require('./ComponentInstance');
require('./CommandProxy');
        

/**
 * ComponentLoader is the interface given to the user to start the components framework.
 */
var ComponentLoader = ComponentDef.lib({
    Base: ComponentDef.defBase(function(SharedTools, Shared) {
        
        return {
            
        };
    }),
    
    
    Host: ComponentDef.defHost(function(SharedTools, Shared) {
        
        return {
            // prototype
            
            /**
             * Loads all components.
             */
            start: function(app, cfg) {
                squishy.assert(app && cfg, "ComponentLoader.start must be called with two arguments.");
                
                // store config
                this.cfg = cfg;
                
                // set default configuration
                cfg.baseUrl = cfg.baseUrl || '/';
                cfg.baseUrl += cfg.baseUrl.endsWith('/') ? '' : '/';
                cfg.publicFolder = cfg.publicFolder || 'pub';
                cfg.publicPath = cfg.publicPath || 'pub';
                cfg.endpointImplementation = cfg.endpointImplementation || {};
                
                // get the folder
                var componentFolder = cfg.baseFolder;
                squishy.assert(componentFolder && componentFolder.length > 0,
                    'cfg.baseFolder is not set. It must be the path of the folder containing all your components.');
                try {
                    componentFolder = fs.realpathSync(componentFolder);
                }
                catch (err) {
                    // failed to find component folder
                    throw new Error('Unable to open components folder `' + cfg.baseFolder + '`: ' + err.stack);
                }
                
                // load all explicitely requested components from user-given folder
                if (cfg.files) {
                    for (var i = 0; i < cfg.files.length; ++i) {
                        var fname = cfg.files[i];
                        
                        // fix the file ending
                        if (!fname.endsWith('.js')) fname += '.js';
                        var fPathAbs = path.join(componentFolder, fname);
                        
                        // all we need to do is to require the file and its containing components automatically register with ComponentDef
                        require(fPathAbs);
                    }
                }
                
                // Setup the communication layer:
                // Use HttpPost as default method.
                ComponentCommunications.setupCommunications(app, cfg);
                
                // call `initHost` on every registered component's Host endpoint
                ComponentDef.initializeHostComponents(app, cfg);
                
                // tell the bootstrapper to open for business
                ComponentBootstrap.bootstrap(app, cfg);

                return Shared;
            },

            Private: {
                onNewClient: function() {
                    var cfg = this.Shared.cfg;
                    if (!cfg.lazyLoad) {
                        // by default, automatically deploy all components to the client:
                        this.Tools.requestClientComponents(Object.keys(this.Instance));
                    }
                }
            }
        };
    }),
    
    /** 
     * Setup the communications layer on the client side.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        return {
        };
    })
});
   
module.exports = ComponentLoader;