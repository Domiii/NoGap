/**
 * ComponentBootstrap is responsible for bootstrapping client-side component code.
 */
"use strict";

var domain = require('domain');
var url = require('url');

var ComponentDef = require('./ComponentDef');
var CodeBuilder = require('squishy').CodeBuilder;

/**
 * Defines a registry for component bootstrapping methods.
 */
var ComponentBootstrap = ComponentDef.lib({
    Base: ComponentDef.defBase(function(Shared) { return {
        Private: {
        }
    }}),

    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var Promise;
        return {
            // ###############################################################################################################################
            // Bootstrapper management & running

            __ctor: function() {
                Promise = Shared.Libs.ComponentDef.Promise;
            },

            /**
             * This magic function kicks everything off.
             * It's called right after all components have been installed.
             */
            bootstrap: function(app, cfg) {
                // get bootstrapper implementation
                var bootstrapperImpl = Shared.Libs.ComponentCommunications.getComponentTransportImpl();
                
                // kick it!
                bootstrapperImpl.bootstrap(app, cfg);
            },

            Private: {
                // ###############################################################################################################################
                // Core bootstrapping routines

                /**
                 *  Installs component instance and returns the code to setup the Component system.
                 */
                bootstrapComponentInstance: function(clientAddr, clientRoot) {
                    console.assert(clientRoot, 'clientRoot must be provided for component installation.');

                    // Move through the communications queue.
                    // This will make sure that parallel requests (even with asynchronous results) are serialized.
                    // This reduces complexity and makes it more difficult for clients to spam.
                    return this.Instance.Libs.ComponentCommunications.executeInOrder(function() {
                        // set bootstrapping flag
                        this.isBootstrapping = true;

                        // store address & port, so all client implementations know where to connect to for commands.
                        this.Instance.Libs.ComponentContext.touch();                         // update last used time

                        // store some client information
                        this.Context.clientAddr = clientAddr;
                        this.Context.clientIsLocal = clientAddr === 'localhost' || clientAddr === '127.0.0.1';
                        this.Context.clientRoot = clientRoot;

                        // initialize host-side installation and collect code for user-specific initialization commands:
                        var allClientDefinitions = Shared.Libs.ComponentDef.getAllClientDefinitions();
                        var libNames = allClientDefinitions.Libs.names;
                        var otherComponentNames = allClientDefinitions.Components.names;

                        // run initialization code
                        return Promise.resolve()

                        // call `onNewClient` on all libs
                        .then(this.callComponentMethods.bind(this, libNames, 'onNewClient'))

                        // call `onNewClient` on all other components
                        .then(this.callComponentMethods.bind(this, otherComponentNames, 'onNewClient'))

                        // call `onClientBootstrap` on all libs
                        .then(this.callComponentMethods.bind(this, libNames, 'onClientBootstrap'))
                    }.bind(this))

                    .bind(this)

                    .then(function(bootstrapHostResponseData) {
                        //this.Tools.traceLog('Sending installer code...');
                        // now, build complete NoGap installation code and return to caller
                        var code = ComponentDef._buildClientInstallCode(bootstrapHostResponseData);

                        // give code back to caller
                        return code;
                    })
                    .finally(function() {
                        // we finished Host-side bootstrapping
                        this.isBootstrapping = false;
                    });
                },

                /**
                 * Call the given method on all of the given component instances.
                 */
                callComponentMethods: function(componentNames, methodName) {
                    var This = this;

                    // Run commands right away (do not queue), then give results back to caller
                    return Promise.map(componentNames, function(componentName) {
                        var component = This.Instance.getComponentOfAnyType(componentName);
                        if (component[methodName] instanceof Function) {
                            // execute application code
                            This.Tools.traceComponentFunctionCall(componentName, methodName);
                            return component[methodName]();
                        }
                    });
                },
                

                // ###############################################################################################################################
                // Lazy-loading of components

                /**
                 * Send the requested components to client, install and initialize them.
                 */
                bootstrapNewClientComponents: function(componentNames) {
                    // get definitions
                    var defs = Shared.Libs.ComponentDef._getClientComponentDefsForDeployment(componentNames);

                    // get assets
                    var transportImpl = Shared.Libs.ComponentCommunications.getComponentTransportImpl();

                    // send component definitions and assets to Client, and bootstrap them
                    var clientAssets = Shared.Libs.ComponentAssets.getClientAssets(componentNames, transportImpl.assetHandlers);
                    this.client.bootstrapNewComponents(defs, clientAssets);

                    // call `onClientBootstrap` for new components on Host
                    return Promise.resolve(componentNames)
                    .bind(this)
                    .map(function(componentName) {
                        var component = this.Instance.getComponentOfAnyType(componentName);
                        if (!component) {
                            return Promise.reject(new Error('Tried to send invalid component to Client: ' + componentName));
                        }
                    })

                    // all components are available!
                    .then(function() {
                        // call `onClientBootstrap` on all new components
                        return this.callComponentMethods(componentNames, 'onClientBootstrap');
                    });

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
                }
            },

            Public: {
                /**
                 * 
                 */
                requestClientComponents: function(componentNames) {
                    if (!componentNames || !componentNames.length) {
                        return Promise.reject('Insufficient arguments for `requestClientComponents`.');
                    }

                    // check if requested components exist and may be used by current client
                    for (var i = componentNames.length-1; i >= 0; --i) {
                        var compName = componentNames[i];
                        var comp = this.Instance[compName];
                        if (!comp) {
                            // does not exist
                            var err = 'Called `requestClientComponents` with unknown component: ' + compName + 
                                ' - Available components are: ' + Object.keys(this.Instance);
                            return Promise.reject(err);
                        }
                        // else if (clientComponents[compName]) {
                        //     // component already exists: remove
                        //     componentNames.splice(i, 1);
                        // }
                        else if (comp.mayClientRequestComponent && !comp.mayClientRequestComponent()) {
                            // is not allowed
                            var err = 'Called `requestClientComponents` but `mayClientRequestComponent` returned false: ' + compName;
                            return Promise.reject(err);
                        }
                    }
                    
                    // actually enable the components
                    return this.bootstrapNewClientComponents(componentNames);
                }
            }
        };
    }),
    
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        var thisInstance;
        return thisInstance = {
            Private: {
                /**
                 * This is called after ComponentDef has installed the component library on the client.
                 */
                onClientReady: function(bootstrapHostResponseData) {
                    // execute initial commands on client
                    Instance.Libs.ComponentCommunications.handleHostResponse(bootstrapHostResponseData);
                },

                /**
                 * Request the given set of new client components from the server.
                 * This is what `Tools.requestClientComponents` ends up calling.
                 */
                requestClientComponents: function(componentNames) {
                    console.assert(componentNames instanceof Array,
                        'The first argument to `requestClientComponents` must be an array of component names.');

                    // remove all components that already exist
                    for (var i = componentNames.length-1; i >= 0; --i) {
                        var compName = componentNames[i];
                        if (Instance[compName]) {
                            // component already exists: remove
                            componentNames.splice(i, 1);
                        }
                    }

                    if (componentNames.length > 0) {
                        // send request to host
                        return this.host.requestClientComponents(componentNames);
                    }

                    // always return a promise!
                    return Promise.resolve();
                }
            },


            Public: {
                /**
                 * Called by the server when the given components have been requested.
                 */
                bootstrapNewComponents: function(componentDefs, assets) {
                    for (var i = componentDefs.length-1; i >= 0; --i) {
                        var componentName = componentDefs[i].Client.FullName;
                        componentDefs[i].toString = function() { return this.Client.FullName; };
                        if (Instance[componentName]) {
                            // ignore already existing components
                            console.warn('Component installation was sent more than once: ' + componentName +
                                ' -- Make sure to check (or add checks to) all calls to `Tools.requestClientComponents`.');
                            componentDefs.splice(i, 1);
                        }
                    }
                    Tools.traceLog('bootstrapping ' + componentDefs.length + ' new components: ' + componentDefs);

                    // install new components
                    Instance.Libs.ComponentDef.installClientComponents(componentDefs, Instance);

                    // install the assets of the new components
                    var transportImpl = Instance.Libs.ComponentCommunications.getComponentTransportImpl();
                    console.assert(transportImpl, 'Could not lookup the host endpoint of the transport layer implementation.');

                    Instance.Libs.ComponentAssets.initializeClientAssets(assets, transportImpl.assetHandlers);

                    // do some more initialization and finally, call `initClient`
                    Instance.Libs.ComponentDef.initClientComponents(componentDefs, Instance);

                    // call `onNewComponent`, followed by `onNewComponents`
                    Instance.forEachComponentOfAnyType(function(component) {
                        if (component.onNewComponent) {
                            // call onNewComponent many times
                            Tools.traceComponentFunctionCall(component.Shared._def.FullName, 'onNewComponent');
                            for (var j = 0; j < componentDefs.length; ++j) {
                                var componentName = componentDefs[j].Client.FullName;
                                component.onNewComponent(Instance[componentName]);
                            }
                        }
                        if (component.onNewComponents) {
                            // call onNewComponents with an array of all new components as first argument
                            var newComponents = squishy.createArray(componentDefs.length);
                            for (var j = 0; j < componentDefs.length; ++j) {
                                var componentName = componentDefs[j].Client.FullName;
                                newComponents[j] = Instance[componentName];
                            };
                            Tools.traceComponentFunctionCall(component.Shared._def.FullName, 'onNewComponents');
                            component.onNewComponents(newComponents);
                        }
                    });
                }
            }
        };
    })
});

module.exports = ComponentBootstrap;