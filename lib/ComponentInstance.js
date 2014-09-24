/**
 * This file handles the different Component instance sets for each Client.
 */
"use strict";

var ComponentDef = require('./ComponentDef');

module.exports = ComponentDef.lib({
    Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) { 
        return {
            patchInstance: function(instance, Tools, Instance, Context, componentShared) {
                // add Instance map
                Object.defineProperty(instance, 'Instance', {
                    value: Instance
                });

                // add Tools
                Object.defineProperty(instance, 'Tools', {
                    value: Tools
                });

                // add Context
                Object.defineProperty(instance, 'Context', {
                    value: Context
                });

                // add Shared object
                Object.defineProperty(instance, componentShared._def.FullName, {
                    value: componentShared
                });
                Object.defineProperty(instance, 'Shared', {
                    value: componentShared
                });
            },
        };
    }),

    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) { 
    	return {
            /**
             * A set of component instances is attached to every session.
             */
            allInstances: {},

            /**
             * This is called by ComponentDef during initialization on Client and Host.
             */
            onComponentInstallation: function(componentShared) {
                // getInstance(sessionId) returns the corresponding instance of the current shared component endpoint, belonging to the given session
                Object.defineProperty(componentShared, 'getInstance', {
                    value: function(sessionId) {
                        return componentShared._def.instances ? componentShared._def.instances[sessionId] : null;
                    }
                });
            },

            getInstanceMap: function(sessionId) {
                // get instance map
                return this.allInstances[sessionId];
            },

            /**
             * This is called by the bootstrapper to get or create a new `Instance` map.
             */
            createInstanceMap: function(sessionId) {
                // get or create instance map
                // TODO: Make sure to set a max size on the cache and dequeue/destroy old instances.
                //      At the same time, prevent thrashing (instance maps must be unused for a while to be deleted).

                var Instance = this.getInstanceMap(sessionId);
                if (!Instance) {
                    // create a new instance map, containing an instance of each component
                    // TODO: Make sure to get rid of unused instance objects
                    this.allInstances[sessionId] = Instance = Shared.Libs.ComponentDef.createComponentMap(false);

                    // create new Tools object that provides some shared methods for all component instance objects
                    var Tools = Shared.Libs.ComponentTools.createInstanceTools(Instance, Context);

                    // create new Context object that provides shared data across this component instanciation
                    var Context = Shared.Libs.ComponentContext.createInstanceContext(Instance);

                    // create new instance for the given component
                    var createInstance = function(componentShared) {
                        var def = componentShared._def;
                        var instancesOfComponents = def.instances || (def.instances = {});
                        var compName = def.FullName;

                        // create component instance object
                        var instance = Object.create(def.InstanceProto);

                        console.assert(!instance.Tools, 'Component instance (Public or Private) of `' + componentShared + 
                            '` defined reserved property `Tools`. Remove it!');
                        console.assert(!instance.Context, 'Component instance (Public or Private) of `' + componentShared + 
                            '` defined reserved property `Context`. Remove it!');
                        console.assert(!instance.Shared, 'Component instance (Public or Private) of `' + componentShared + 
                            '` defined reserved property `Shared`. Remove it!');

                        this.patchInstance(instance, Tools, Instance, Context, componentShared);

                        // add to Instance collections
                        instanceMap[compName] = instance;
                        instancesOfComponents[sessionId] = instance;
                    }.bind(this);

                    
                    // create lib instances
                    var instanceMap = Instance.Libs;
                    Shared.Libs.forEach(createInstance);

                    // create all other instances
                    instanceMap = Instance;
                    Shared.forEach(createInstance);

                    // add a `client` object to each instance
                    Instance.Libs.CommandProxy.addClientCommandProxies();
 
                    // call ctor on libs
                    Instance.Libs.forEach(function(componentInstance) {
                        // call instance ctors on lib instances
                        if (componentInstance.__baseCtor) {
                            componentInstance.__baseCtor();
                            delete componentInstance.__baseCtor;
                        }
                        if (componentInstance.__ctor) {
                            componentInstance.__ctor();
                            delete componentInstance.__ctor;
                        }
                    });

                    // call ctor on all other components
                    Instance.forEach(function(componentInstance) {
                        // call instance ctors on non-lib instances
                        if (componentInstance.__baseCtor) {
                            componentInstance.__baseCtor();
                            delete componentInstance.__baseCtor;
                        }
                        if (componentInstance.__ctor) {
                            componentInstance.__ctor();
                            delete componentInstance.__ctor;
                        }
                    });
                }
                return Instance;
            },

            activateSession: function(session, sessionId) {
                var Instance = this.getInstanceMap(sessionId);
                if (!Instance) return null;

                Instance.Libs.ComponentSession.setSession(session, sessionId);
                return Instance;
            },

            Private: {
            }
        };
    }),
    
    
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        return {
            /**
             * This is called by ComponentDef during initialization on Client and Host.
             */
            onComponentInstallation: function(component) {
                // patch up the client-side component instance:
                this.patchInstance(component, Tools, Instance, Context, component);

                // merge Private/Public into the Client instance
                var privateName = component._def.getFullInstanceMemberName('Private/Public');

                Instance.Libs.ComponentDef.doMerge(component, privateName, component._def.FullName + '.Client', 
                    component._def.InstanceProto, component, true);

                // call instance ctors
                if (component.__baseCtor) {
                    component.__baseCtor();
                    delete component.__baseCtor;
                }
                if (component.__ctor) {
                    component.__ctor();
                    delete component.__ctor;
                }
            }
        };
    })
});