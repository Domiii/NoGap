/**
 * This file handles the different Component instance sets for each Client.
 */
"use strict";

var ComponentDef = require('./ComponentDef');

module.exports = ComponentDef.lib({
    Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) { 
        return {
            patchInstance: function(instance, Tools, Instance, Context, componentShared) {
                // bind all instance methods to instance

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

                if (componentShared) {
                    // add Shared object
                    Object.defineProperty(instance, componentShared.Def.FullName, {
                        value: componentShared
                    });
                    Object.defineProperty(instance, 'Shared', {
                        value: componentShared
                    });
                }
            },
        };
    }),

    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var LinkedList;
        var nLifetimeInstances = 0;

    	return {
            /**
             * Cache of component instances per session
             */
            instancesById: {},
            instanceNodesById: {},
            instancesList: null,

            maxInstanceCacheSize: 10000,

            __ctor: function() {
                LinkedList = require(__dirname + '/util/LinkedList');

                this.instancesList = new LinkedList();
            },

            /**
             * Remove an instance from cache
             */
            _shrinkInstanceCache: function() {
                // get head node
                var headNode = this.instancesList.getHeadNode();
                var Instance = headNode.data;
                var sessionId = Instance.__sessionId;

                // TODO: Make sure, this instance is not still currently bootstrapping or involved in any other
                //          critical operation!!

                // remove node
                delete this.instancesById[sessionId];
                delete this.instanceNodesById[sessionId];
                this.instancesList.removeNode(headNode);
            },

            _registerInstanceMap: function(sessionId, Instance) {
                if (this.maxInstanceCacheSize > 0 && 
                    this.instancesList.size() >= this.maxInstanceCacheSize) {
                    this._shrinkInstanceCache();
                }

                // add sessionId property
                Object.defineProperty(Instance, '__sessionId', {
                    value: sessionId
                });

                // add instance map to set
                var listNode = this.instancesList.pushBack(Instance);
                this.instancesById[sessionId] = Instance;
                this.instanceNodesById[sessionId] = listNode;

                ++nLifetimeInstances;
                if ((nLifetimeInstances % 1000) === 0) {
                    console.log('Served ' + nLifetimeInstances + ' life time clients.');
                }
            },

            /**
             * Given Instance has been activated after being used previously
             */
            _refreshInstanceMap: function(Instance, session, sessionId, isNew) {
                // update last used time
                Instance.Libs.ComponentContext.touch();

                // set session data
                Instance.Libs.ComponentSession.setSession(session, sessionId);

                if (!isNew) {
                    // move instance node to the back
                    var listNode = this.instanceNodesById[sessionId];
                    this.instancesList.pushBackNode(listNode);
                }

                // // debugging
                // var ids = [];
                // this.instancesList.forEach(function(node) {
                //     ids.push(node._nodeId);
                // });
                // console.error('Instance sessionIds (' + this.instancesList.size() +
                //     '/' + this.maxInstanceCacheSize + '):' + ids);
            },

            initHost: function(app, cfg) {
                this.maxInstanceCacheSize = 
                    cfg.maxInstanceCacheSize ||
                    this.maxInstanceCacheSize;
            },

            /**
             * This is called by ComponentDef during initialization on Client and Host.
             */
            onComponentInstallation: function(componentShared) {
                // getInstance(sessionId) returns the corresponding instance of the current shared component endpoint, belonging to the given session
                Object.defineProperty(componentShared, 'getInstance', {
                    value: function(sessionId) {
                        return componentShared.Def.instances ? componentShared.Def.instances[sessionId] : null;
                    }
                });
            },

            createInstanceMap: function(sessionId) {
                // create a new instance map, containing an instance of each component
                var Instance = Shared.Libs.ComponentDef._createComponentMap(false);
                if (sessionId) {
                    this._registerInstanceMap(sessionId, Instance);
                }

                // create new instance for the given component
                var createComponentInstance = function(componentShared) {
                    var def = componentShared.Def;
                    var instancesOfComponents = def.instances || (def.instances = {});
                    var compName = def.FullName;

                    // create component instance object and bind all methods to itself
                    var instance = Object.create(def.InstanceProto);

                    console.assert(!instance.Tools, 'Component instance (Public or Private) of `' + componentShared + 
                        '` defined reserved property `Tools`. Remove it!');
                    console.assert(!instance.Context, 'Component instance (Public or Private) of `' + componentShared + 
                        '` defined reserved property `Context`. Remove it!');
                    console.assert(!instance.Shared, 'Component instance (Public or Private) of `' + componentShared + 
                        '` defined reserved property `Shared`. Remove it!');

                    // add Shared object
                    Object.defineProperty(instance, def.FullName, {
                        value: componentShared
                    });
                    Object.defineProperty(instance, 'Shared', {
                        value: componentShared
                    });

                    // add to Instance collections
                    instanceMap[compName] = instance;
                    instancesOfComponents[sessionId] = instance;
                }.bind(this);

                var patchInstance = function(instance) {
                    this.patchInstance(instance, Tools, Instance, Context);
                }.bind(this);

                
                // create lib instances
                var instanceMap = Instance.Libs;
                Shared.Libs.forEach(createComponentInstance);

                // Tools et al are now ready and available.
                var Tools = Shared.Libs.ComponentTools.createInstanceTools(Instance, Context);
                var Context = Shared.Libs.ComponentContext.createInstanceContext(Instance);

                // patch!
                instanceMap.forEach(patchInstance);

                // create and patch all other instances
                instanceMap = Instance;
                Shared.forEach(createComponentInstance);
                instanceMap.forEach(patchInstance);

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
                return Instance;
            },

            getInstanceMap: function(sessionId) {
                // get instance map
                return this.instancesById[sessionId];
            },

            /**
             * This is called by the bootstrapper to get or create a new `Instance` map.
             */
            getOrCreateInstanceMap: function(sessionId) {
                // get or create instance map
                var Instance = this.getInstanceMap(sessionId);
                if (!Instance) {
                    Instance = this.createInstanceMap(sessionId);
                }
                return Instance;
            },

            doesSessionExist: function(sessionId) {
                return !!this.getInstanceMap(sessionId);
            },

            activateSession: function(session, sessionId, doesClientExist) {
                var Instance = this.getInstanceMap(sessionId);
                var isNew = false;
                if (!Instance) {
                    // create entirely new instance map
                    Instance = this.createInstanceMap(sessionId);
                    isNew = true;
                }

                // 
                this._refreshInstanceMap(Instance, session, sessionId, isNew);

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
                // merge Private/Public into the Client instance
                var instanceProtoName = component.Def.getFullInstanceMemberName('Private/Public');

                component = Instance.Libs.ComponentDef._doMergeEndpoints(component.Def.FullName + '.Client', 
                    instanceProtoName, component.toString(),
                    component.Def.InstanceProto, component, true);

                // patch up the client-side component instance:
                this.patchInstance(component, Tools, Instance, Context, component);

                // TODO: Make this more consistent (e.g. client ctor arguments are missing)
                // Call Private __ctor's (different from ComponentDef's ctor calls)
                if (component.__baseCtor) {
                    component.__baseCtor();
                    component.__baseCtor = null;
                }
                if (component.__ctor) {
                    component.__ctor();
                    component.__ctor = null;
                }
            }
        };
    })
});