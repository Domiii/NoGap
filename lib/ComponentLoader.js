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
require('./ComponentAssets');

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
                    'NoGap ERROR in configuration - `baseFolder` is not set. It must be set to the path of the folder containing all your components.');

                try {
                    componentFolder = fs.realpathSync(componentFolder);
                }
                catch (err) {
                    // failed to find component folder
                    throw new Error('Unable to open components folder `' + cfg.baseFolder + '`. Please check your config\'s `baseFolder` property: ' + err.stack);
                }
                
                // load all explicitely requested components from user-given folder
                if (cfg.files) {
                    this._loadComponents(componentFolder, cfg.files, 'your config\'s `files` property');
                }
                
                // Setup the communication layer:
                // Use HttpPost as default method.
                ComponentCommunications.setupCommunications(app, cfg.endpointImplementation);
                
                // call `initHost` on every registered component's Host endpoint
                ComponentDef.initializeHostComponents(app, cfg);
                
                // tell the bootstrapper to open for business
                ComponentBootstrap.bootstrap(app, cfg);

                return Shared;
            },

            /**
             * Load components recursively.
             */
            _loadComponents: function(folder, fileNames, sourceDescription) {
                for (var i = 0; i < fileNames.length; ++i) {
                    var fname = fileNames[i];
                    
                    // fix the file ending
                    if (!fname.endsWith('.js')) fname += '.js';
                    var fPathAbs = path.join(folder, fname);

                    // make sure, the file exists
                    if (!fs.existsSync(fPathAbs)) {
                        throw new Error('NoGap ERROR in configuration - Component file `' + fPathAbs + 
                            '` does not exist. Please check ' + sourceDescription);
                    }
                    
                    // all we need to do now is to require the file
                    // and its containing components will automatically register with ComponentDef
                    var component = require(fPathAbs);
                    var includes = component._def.Includes;
                    if (includes) {
                        // load components, relative to the current component
                        this._loadComponents(path.dirname(fPathAbs), includes, '`Includes` of component definition `' + component._def.FullName + '`');
                    }
                }
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