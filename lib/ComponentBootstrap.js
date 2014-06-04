/**
 * ComponentBootstrap is responsible for bootstrapping client-side component code.
 * The bootstrapping implementation (which needs to be selected upon start-up) determines how the components are bootstrapped on the client.
 */
"use strict";

var domain = require('domain');
var url = require('url');

var ComponentDef = require('./ComponentDef');
var CodeBuilder = require('squishy').CodeBuilder;

/**
 * @interface
 */
var BootstrapperImpl = {
    ImplName: "<short name describing implementation type>",
    
    /**
     * This code will only execute on the client side of a component.
     */
    Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) { return {
        assetHandlers: {
            autoIncludeResolvers: {},
            autoIncludeCodeFactories: {}
        }
    };}),

    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) { return {
        /**
         * Actually bootstrap this whole thing.
         */
        bootstrap: function(app, cfg) {}
    };}),

    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        return {
            Public: {
                /**
                 * Do it all over: Kill current instance and try again.
                 * This is effectively a page refresh for browsers but possibly 
                 * needs some extra work so it works for webworkers 
                 * or other environments.
                 */
                refresh: function() { }
            }
        };
    })
};

/**
 * Defines a registry for component bootstrapping methods.
 */
var ComponentBootstrap = ComponentDef.lib({
    Base: ComponentDef.defBase(function(Shared) { return {
        getImplComponentLibName: function(name) {
            //return 'ComponentBootstrapImpl_' + name;
            return 'ComponentBootstrapImpl_';
        },

        getCurrentBootstrapperImpl: function() {
            return Shared.Libs[this.getImplComponentLibName()];
        },
        
        Private: {
            /**
             * Get the current instance of the bootstrapper implementation.
             */
            getCurrentBootstrapperImpl: function() {
                return this.Instance.Libs[this.Shared.getImplComponentLibName()];
            },
        }
    }}),

    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        return {
            // ###############################################################################################################################
            // Bootstrapper management & running

            __ctor: function() {
                this.implementations = {};
            },

            /**
             * Register a custom bootstrapper implementation.
             */
            registerBootstrapper: function(implType) {
                squishy.assert(typeof(implType) === 'object', 
                    'BootstrapperImpl definition must implement the `BootstrapperImpl` interface.');
                    
                squishy.assert(implType.ImplName, 'Unnamed BootstrapperImpl is illegal. Make sure to set the `ImplName` property.');
                
                // register implementation as component, so we get it's client side functionality as well
                implType.Name = this.getImplComponentLibName();
                    
                // register implementation as lib (so we also get access to it on the client side), and store it in implementations array.
                this.implementations[implType.ImplName] = ComponentDef.lib(implType);
            },
            
            /**
             * Get the bootstrapper implementation of the given name.
             */
            getBootstrapper: function(name) {
                var booter = this.implementations[name];
                squishy.assert(booter, 'Invalid bootstrapper: ' + name + ' - Possible choices are: ' + Object.keys(this.implementations));
                return booter;
            },
        
            /**
             * This magic function kicks everything off.
             */
            bootstrap: function(app, cfg) {
                // get bootstrapper implementation
                var bootstrapper = this.getBootstrapper(cfg.bootstrapper || 'HttpGet');
                
                // kick it!
                bootstrapper.bootstrap(app, cfg);
            },

            // ###############################################################################################################################
            // Tools for bootstrapper implementations

            /**
             *  Installs component instance and returns the code to setup the Component system.
             */
            installComponentInstanceAndGetClientBootstrapCode: function(session, sessionId, clientAddr, clientRoot, cb) {
                console.assert('clientRoot must be provided for component installation.');

                // get or create Instance map
                var Instance = Shared.Libs.ComponentInstance.createInstanceMap(sessionId);

                // set session
                Instance.Libs.ComponentSession.setSession(session, sessionId);

                // get instance of this
                var thisInstance = Instance.Libs.ComponentBootstrap;

                // set bootstrapping flag
                thisInstance.isBootstrapping = true;

                // store address & port, so all client implementations know where to connect to for commands.
                Instance.Libs.ComponentContext.touch();                         // update last used time

                // store some client information
                thisInstance.Context.clientAddr = clientAddr;
                thisInstance.Context.clientIsLocal = clientAddr === 'localhost' || clientAddr === '127.0.0.1';
                thisInstance.Context.clientRoot = clientRoot;

                // initialize host-side installation and collect code for user-specific initialization commands:
                var libNames = Shared.Libs.ComponentDef.clientDefs.Libs.names;
                var componentNames = Shared.Libs.ComponentDef.clientDefs.Components.names;

                // store all commands to be executed on the client side
                var libCmds = [];
                var componentCmds = [];

                // call `onNewClient` on all libs
                var step1 = function() {
                    thisInstance.collectCommandsFromHostCalls(libNames, libCmds, 'onNewClient', step2);
                };

                // call `onClientBootstrap` on all libs
                var step2 = function() {
                    thisInstance.collectCommandsFromHostCalls(libNames, libCmds, 'onClientBootstrap', step3);
                };

                // call `onNewClient` on all other components
                var step3 = function() {
                    thisInstance.collectCommandsFromHostCalls(componentNames, componentCmds, 'onNewClient', 
                        function() {
                            // get code to initialize the component framework
                            var bootstrapData = {
                                libCmds: libCmds,
                                componentCmds: componentCmds
                            };
                            var code = ComponentDef.getClientInstallCode(bootstrapData);

                            // we are done with bootstrapping
                            thisInstance.isBootstrapping = false;

                            // give code back to caller
                            cb(code);
                        });
                };

                // go!
                step1();
            },

            Private: {
                /**
                 * Get client-specific initialization code
                 * by calling the given method on all of the given component instances,
                 * while buffering all commands to be executed on client side and copying them to `allCommands`.
                 * Calls `cb`, once finished.
                 */
                collectCommandsFromHostCalls: function(componentNames, allCommands, methodName, doneCb) {
                    var This = this;
                    var Instance = this.Instance;

                    // call the given method on every component that has it
                    var callMethods = function() {
                        componentNames.forEach(function(componentName) {
                            var component = Instance.getComponentOfAnyType(componentName);
                            if (component[methodName]) {
                                component[methodName]();
                            }
                        });
                    };

                    // collect all commands raised by the given components
                    if (this.isBootstrapping) {
                        // use connection overrides to get all commands to be sent
                        var connection = {
                            sendCommandsToClient: function(initCommands) {
                                // store all commands
                                for (var i = 0; i < initCommands.length; ++i) {
                                    allCommands.push(initCommands[i]);
                                }
                            },

                            staysOpen: function() { return false; }
                        };

                        Instance.Libs.ComponentCommunications.executeCommandRaisingCode(connection, 
                            // call all methods, while all resulting commands are buffered
                            callMethods,

                            // notify caller after we are done intercepting
                            doneCb);
                    }
                    else {
                        // the commands to be raised by the calls can just be carried over by the default connection implementation
                        callMethods();
                        doneCb();
                    }
                },
                

                // ###############################################################################################################################
                // Lazy-loading of components

                /**
                 * Send the requested components to client, install and initialize them.
                 */
                bootstrapNewClientComponents: function(componentNames) {
                    // get definitions
                    var defs = Shared.Libs.ComponentDef.getClientComponentDefs(componentNames);

                    // get assets
                    var bootstrapImplClient = Shared.Libs[this.ComponentBootstrap.getImplComponentLibName()];
                    console.assert(bootstrapImplClient, 'Could not lookup the host endpoint of the bootstrapper implementation.');
                    var clientAssets = Shared.Libs.Assets.getClientAssets(componentNames, bootstrapImplClient.assetHandlers);

                    // tell client to bootstrap these guys
                    this.client.bootstrapNewComponents(defs, clientAssets);

                    // call `onClientBootstrap` for new components
                    componentNames.forEach(function(componentName) {
                        var component = this.Instance.getComponentOfAnyType(componentName);
                        if (!component) {
                            This.client.logError('Tried to bootstrap invalid component: ' + component);
                            return;
                        }
                        if (component.onClientBootstrap) {
                            component.onClientBootstrap();
                        }
                    }.bind(this));

                    // TODO: Some better dependency management
                    // // add `explicitly requested` components
                    // for (var i = 0; i < componentNames.length; ++i) {
                    //     var componentShared = Shared[componentNames[i]];
                    //     if (componentShared.Assets && componentShared.Assets.Components) {
                    //         console.assert(componentShared.Assets.Components instanceof Array,
                    //             '`Assets.Components` is not declared as array in component ' + componentShared + '.');
                    //         this.client.requestClientComponents(componentShared.Assets.Components);
                    //     }
                    // }
                    
                    // TODO: Keep track of client-side components reliably
                    // var internalContext = Instance.Libs.ComponentContext.getInternalContext();
                    // var clientComponents = internalContext.clientComponents || (internalContext.clientComponents = {});
                    
                    // install new components + assets, & fire events
                },

                requestClientComponentsFromHost: function(componentNames) {
                    this.requestClientComponents(componentNames);
                },

                refresh: function() {
                    this.getCurrentBootstrapperImpl().client.refresh();
                }
            },

            Public: {
                /**
                 * 
                 */
                requestClientComponents: function(componentNames) {
                    // check if requested components exist and may be used by current client
                    for (var i = componentNames.length-1; i >= 0; --i) {
                        var compName = componentNames[i];
                        var comp = this.Instance[compName];
                        if (!comp) {
                            // does not exist
                            var err = 'Called `requestClientComponents` with unknown component: ' + compName + 
                                ' - Available components are: ' + Object.keys(this.Instance);
                            this.client.logError(err);
                            return;
                        }
                        // else if (clientComponents[compName]) {
                        //     // component already exists: remove
                        //     componentNames.splice(i, 1);
                        // }
                        else if (comp.mayClientRequestComponent && !comp.mayClientRequestComponent()) {
                            // is not allowed
                            var err = 'Called `requestClientComponents` but `mayClientRequestComponent` returned false: ' + compName;
                            if (cb) {
                                cb(err);
                            }
                            else {
                                this.client.logError(err);   
                            }
                            return;
                        }
                    }
                    
                    // actually enable the components
                    this.bootstrapNewClientComponents(componentNames);
                }
            }
        };
    }),
    
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        var pendingInitializers = [];
        var pendingComponents = [];
        
        var addInitializerCallback = function(names, cb) {
            pendingInitializers.push({
                names: names,
                cb: cb
            });
        };

        /**
         * Names of components already requested but not there yet.
         */
        var pendingComponents = {};
        
        return {

            Private: {
                /**
                 * Lets the client execute arbitrary code (evil? maybe!).
                 */
                runCode: function(code) {
                    eval(code);
                },

                /**
                 * This is called after ComponentDef has installed the component library on the client.
                 */
                onClientReady: function(bootstrapData) {
                    // execute initial commands on client
                    Instance.Libs.CommandProxy.execHostCommands(bootstrapData.libCmds);
                    Instance.Libs.CommandProxy.execHostCommands(bootstrapData.componentCmds);
                },

                refresh: function() {
                    this.getCurrentBootstrapperImpl().refresh();
                }
            },


            Public: {
                /**
                 * Request the given set of new client components from the server.
                 * This is what `Tools.requestClientComponents` ends up calling.
                 */
                requestClientComponents: function(componentNames, cb) {
                    console.assert(componentNames instanceof Array,
                        'The first argument to `requestClientComponents` must be an array of component names.');

                    // remove all components that already exist
                    for (var i = componentNames.length-1; i >= 0; --i) {
                        var compName = componentNames[i];
                        if (Instance[compName] || pendingComponents[componentName]) {
                            // component already exists: remove
                            componentNames.splice(i, 1);
                        }
                        else {
                            pendingComponents[componentName] = 1;
                        }
                    }
                    
                    if (componentNames.length > 0) {
                        // remember cb, so it can be called when components have been enabled
                        addInitializerCallback(componentNames, cb);

                        // send request to host
                        this.host.requestClientComponents(componentNames);
                    }
                    else if (cb) {
                        // components are already ready, so we can fire right away
                        cb();
                    }
                },

                /**
                 * Called by the server when the given components have been requested and were not present before
                 */
                bootstrapNewComponents: function(componentDefs, assets) {
                    for (var i = componentDefs.length-1; i >= 0; --i) {
                        var componentName = componentDefs[i].Client.FullName;
                        if (Instance[componentName]) {
                            // ignore already existing components
                            console.warn('Component was requested more than once: ' + componentName +
                                ' -- Make sure to check (or add checks to) all calls to Tools.requestClientComponents.');
                            componentDefs.splice(i, 1);
                        }
                        delete pendingComponents[componentName];
                    }

                    // install new components
                    Instance.Libs.ComponentDef.installClientComponents(componentDefs, Instance);

                    // install the assets of the new components
                    var bootstrapImplClient = Instance.Libs[this.getImplComponentLibName()];
                    console.assert(bootstrapImplClient, 'Could not lookup BootstrapImpl client.');
                    Instance.Libs.Assets.initializeClientAssets(assets, bootstrapImplClient.assetHandlers);

                    // do some more initialization and finally, call `initClient`
                    Instance.Libs.ComponentDef.initClientComponents(componentDefs, Instance);

                    // call `onNewComponent`
                    Instance.forEachComponentOfAnyType(function(component) {
                        if (component.onNewComponent) {
                            for (var j = 0; j < componentDefs.length; ++j) {
                                var componentName = componentDefs[j].Client.FullName;
                                component.onNewComponent(Instance[componentName]);
                            }
                        }
                    });
                    
                    // check for pending callbacks to call
                    for (var i = pendingInitializers.length-1; i >= 0; --i) {
                        var init = pendingInitializers[i];
                        var done = true;
                        for (var j = 0; j < init.names.length; ++j) {
                            if (!Instance[init.names[j]]) {
                                // this callback is still waiting for components that were not delivered
                                done = false;
                                break;
                            }
                        }
                        if (done) {
                            // all requested components have been loaded 
                            //  -> call callback & remove initializer
                            if (init.cb) {
                                init.cb();
                            }
                            pendingInitializers.splice(i, 1);
                        }
                    }
                }
            }
        };
    })
});


// ############################################################################################################
// Default bootstrapper implementations

/**
 * Defines a set of default deployment methods (really, just one).
 * This is host-only, so we are not defining it as a Component or Component library.
 */
var DefaultComponentBootstrappers = [
    /**
     * Simplest method: Component framework is deployed in Browser when navigating to some path.
     */
    {
        ImplName: 'HttpGet',

        Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) {
            return {
                /** 
                 * Asset handlers are given to the Assets library for initializing assets.
                 */
                assetHandlers: {
                    /**
                     * Functions to fix filenames of given types.
                     */
                    autoIncludeResolvers: {
                        js: function(fname) {
                            if (!fname.endsWith('.js')) fname += '.js';
                            return fname;
                        },
                        
                        css: function(fname) {
                            if (!fname.endsWith('.css')) fname += '.css';
                            return fname;
                        }
                    },
                    
                    /**
                     * Functions to generate code for including external files.
                     * Fix tags since they will be added to client.
                     * @see http://stackoverflow.com/a/236106/2228771
                     */
                    autoIncludeCodeFactories: {
                        js: function(fname) {
                            return '\x3Cscript type="text/javascript" src="' + fname + '">\x3C/script>';
                        },
                        css: function(fname) {
                            return '\x3Clink href="' + fname + '" rel="stylesheet" type="text/css">\x3C/link>';
                        },
                        
                        /**
                         * Unsupported format: Provide the complete include string.
                         */
                        raw: function(fname) {
                            return fname;
                        }
                    }
                }
            };
        }),

        Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
            return {
                /**
                 *  When the client connects, render an empty page that deploys the component's client endpoint.
                 */
                bootstrap: function(app, cfg) {
                    // pre-build <script> & <link> includes
                    var includeCode = Shared.Libs.Assets.getAutoIncludeAssets(this.assetHandlers);

                    app.get(cfg.baseUrl + "*", function(req, res, next) {
                        // create a domain to avoid fatal catastrophe caused by a single client
                        // see: http://clock.co.uk/blog/preventing-http-raise-hangup-error-on-destroyed-socket-write-from-crashing-your-nodejs-server
                        var reqDomain = domain.create();

                        var session = req.session;
                        var sessionId = req.sessionID;

                        console.assert(session,
                            'req.session was not set. Make sure to use a session manager before the components library, when using the default Get bootstrapping method.');
                        console.assert(sessionId, 
                            'req.sessionID was not set. Make sure to use a compatible session manager before the components library, when using the default Get bootstrapping method.');

                        // get client root, so we know what address the client sees
                        var clientRoot = req.protocol + '://' + req.get('host');
                        var remoteAddr = req.connection.remoteAddress;
                        
                        // install new instance and generate client-side code
                        Shared.Libs.ComponentBootstrap.installComponentInstanceAndGetClientBootstrapCode(
                            session, sessionId, remoteAddr, clientRoot, function(code, instanceContext) {
                                // send out bootstrapping page to everyone who comes
                                res.writeHead(200, {'Content-Type': 'text/html'});
                                res.write('<!doctype html>\n<html><head>');
                                res.write(includeCode);
                                res.write('</head><body>');
                                res.write('<script type="text/javascript">');
                                res.write(code);
                                res.write('</script>');
                                res.write('</body></html>');

                                res.end(); 
                            });
                    });
                }
            };
        }),

        Client: ComponentDef.defClient(function(Tools, Instance, Context) {
            return {
                Public: {
                    refresh: function() {
                        window.location.reload();
                    }
                }
            };
        })
    }
];
DefaultComponentBootstrappers.forEach(function(impl) {
    ComponentBootstrap.registerBootstrapper(impl);
});

module.exports = ComponentBootstrap;