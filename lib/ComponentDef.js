/**
 * ComponentDef is the core of the component library.
 * It registers all libraries & components on host & client.
 * It provides tools to ComponentLoader for installing components on the host.
 * It provides tools to ComponentBootstrap for installing components on the client.
 */
"use strict";

// squishy gives us some misc utilities
require('squishy');

var StacktraceBuilder = squishy.Stacktrace;
var CodeBuilder = squishy.CodeBuilder;

var path = require('path');


// TODO: Move this out of here
var Dev = 1;


// ##################################################################################################################################################################
// HostCore

/**
 * Core host-side functionality of the component library.
 * ComponentDef needs this to kick-start itself.
 */
var HostCore = {
    /** 
     * This is the code that runs on host & client to bootstrap each side's data.
     * This is the special-purpose version of `installComponent` for installing the `ComponentDef` library component itself.
     * NOTE: If you change this, also make sure to check `installComponent`.
     */
    bootstrapSelf: CodeBuilder.serializeInlineFunction(function (ComponentDefDef, endpointName) {
        // set name on global definition
        ComponentDefDef.FullName = 'ComponentDef';

        // create Base of ComponentDef, so we have basic utilities for installing ComponentDef itself
        var ComponentDefBase = ComponentDefDef.Base.factoryFun();

        // call and remove Base ctor
        ComponentDefBase.__ctor();
        delete ComponentDefBase.__ctor;
        
        // get endpoint definition & set name
        var def = ComponentDefDef[endpointName];
        def.FullName = 'ComponentDef';

        // install Client and/or Host
        var ComponentDefEndpoint = ComponentDefBase.createComponentFromDef(def);
     
        // merge ComponentDef's base with Client/Host
        ComponentDefEndpoint = ComponentDefBase.mergeBaseIntoComponentEndpoint(def, endpointName, ComponentDefBase, ComponentDefEndpoint);
        
        // call and remove endpoint ctor
        if (ComponentDefEndpoint.__ctor) {
            ComponentDefEndpoint.__ctor();
            delete ComponentDefEndpoint.__ctor;
        }

        // final touches on `Host` installation of ComponentDef
        ComponentDefBase.finishInstalledComponentEndpoint(ComponentDefEndpoint, ComponentDefBase, ComponentDefEndpoint.SharedComponents.Libs);
        
        return ComponentDefEndpoint;
    }),


    /**
     * Wraps the given factory function and adds some goodiness, such as serializability.
     */
    FactoryDef: function(factoryFun, type, creationFrame, defMethodName) {
        this.factoryFun = factoryFun;
        this.type = type;
        
        // we want to hide these from the serializer:
        Object.defineProperty(this, 'creationFrame', {
            value: creationFrame
        });
        
        Object.defineProperty(this, 'toString', {
            value: function() {
                return squishy.objToString(this);
            }
        });
        
        if (creationFrame) {
            // build code string:
            // use heuristics to determine correct column of first character
            creationFrame.column += defMethodName.length;
            CodeBuilder.serializeFunction(factoryFun, creationFrame);
        }
    },
    
    /**
     * Defines a Base prototype of a component, which will be merged into both, Host and Client.
     */
    defBase: function(factory) {
        // find out where the base definition starts:
        var trace = StacktraceBuilder.getStacktrace();
        var creationFrame = trace[1];
        
        squishy.assert(typeof(factory) === 'function', 'ComponentDef.defBase must be called on a factory function that returns the `Base` component prototype.');
        return new HostCore.FactoryDef(factory, 'Base', creationFrame, 'defBase');
    },
    
    /**
     * Defines the client-side prototype of a component.
     */
    defClient: function(factory) {
        // find out where the client definition starts:
        var trace = StacktraceBuilder.getStacktrace();
        var creationFrame = trace[1];
        
        squishy.assert(typeof(factory) === 'function', 'ComponentDef.defClient must be called on a factory function that returns the `Client` component prototype.');
        return new HostCore.FactoryDef(factory, 'Client', creationFrame, 'defClient');
    },
    
    defHost: function(factory) {
        var trace = StacktraceBuilder.getStacktrace();
        var creationFrame = trace[1];

        return new HostCore.FactoryDef(factory, 'Host', creationFrame, 'defHost');
    }
};


// define `ComponentDef's definition`
var ComponentDefDef = {
    // ##################################################################################################################################################################
    // base definition

    /**
     * Base is called on host- and client-side, prior to `Host` and `Client`.
     */
    Base: HostCore.defBase(function(Tools, Shared, Context) {
        /** 
         * @constructor
         * Creates a new client-side component registry for the given category of components.
         */
        var ComponentMap = function(catName) {
            Object.defineProperty(this, 'get', {
                value: function(name) {
                    if (!this.hasOwnProperty(name)) {
                        // tried to get invalid component
                        throw new Error('Tried to get non-existing ' + this._data.catName + ' `' + name + '`' + 
                            ' -- Did you forget to call Tools.requestClientComponents? Available are: ' + Object.keys(this));
                    }
                    return this[name];
                }.bind(this)
            });
            
            // some other component-related stuff
            Object.defineProperty(this, '_data', {
                value: {
                    catName: catName
                }
            });
            
            Object.defineProperty(this, 'forEach', {
                value: function(cb) {
                    for (var name in this) {
                        if (!this.hasOwnProperty(name)) continue;
                        cb(this[name]);
                    }
                }.bind(this)
            });

            Object.defineProperty(this, 'addComponent', {
                value: function(compName, component) {
                    this[compName] = component;
                }
            })
        };

        var fixPartialInstanceProto = function(componentEndpoint, publicPrivate) {
            Object.defineProperty(componentEndpoint, publicPrivate, {
                get: function() {
                    throw new Error('Tried to access `Shared.' + componentEndpoint._def.getFullInstanceMemberName(publicPrivate) + 
                        '`. Access it\'s methods on an instance of that component instead (by e.g. calling `this.Instance.' + 
                        componentEndpoint._def.FullName + '.someMethod(...)` or simply `this.someMethod(...)`.');
                }
            });
        };
        
        
        // return the actual Base prototype
        return {
            SharedComponents: undefined,
            SharedTools: {},
            SharedContext: {},

            __ctor: function() {
                Shared = this.SharedComponents = this.createComponentMap(true);
            },


            // ################################################################################################################
            // Component maps (Shared & Instance objects)
        
            /**
             * This function builds a component map that can serve as `Components` or `Shared` object.
             */
            createComponentMap: function(isShared) {
                var map = new ComponentMap(isShared ? 'Shared Component' : 'Component Instance');
                
                Object.defineProperty(map, 'Libs', {
                    value: new ComponentMap(isShared ? 'Shared Library Component' : 'Library Component Instance')
                });
                    
                Object.defineProperty(map, 'getComponentOfAnyType', {
                    value: function(name) {
                        if (this.hasOwnProperty(name)) {
                            return this[name];
                        }
                        else if (this.Libs.hasOwnProperty(name)) {
                            return this.Libs[name];
                        }
                        return null;
                    }
                });
                
                Object.defineProperty(map, 'forEachComponentOfAnyType', {
                    value: function(cb) {
                        this.Libs.forEach(cb);
                        this.forEach(cb);
                    }
                });

                return map;
            },
            

            // ################################################################################################################
            // Component installation

            /**
             * Run the factory of the given code definition to create the actual component.
             * Then call & erase ctor.
             */
            createComponentFromDef: function(codeDef) {
                // add Components and a pseudo-global called `Context`
                return codeDef.factoryFun(this.SharedTools, Shared, this.SharedContext);
            },
            
            /**
             * Do some default work on all component endpoints:
             * Override toString, set some default properties,
             * then create the merged Instance prototype from `Private` and `Public`.
             */
            finishInstalledComponentEndpoint: function(componentEndpoint, base, sharedMap) {
                var def = componentEndpoint._def;

                // check integrity
                console.assert(!componentEndpoint.host, 
                    'Component `' + componentEndpoint + '` defined reserved property `host`. Remove it!');
                console.assert(!componentEndpoint.client, 
                    'Component `' + componentEndpoint + '` defined reserved property `client`. Remove it!');
                console.assert(!componentEndpoint.clients, 
                    'Component `' + componentEndpoint + '` defined reserved property `clients`. Remove it!');

                // add some methods
                componentEndpoint.toString = function() { return this._def.FullName; };
                Object.defineProperty(def, 'getFullInstanceMemberName', {
                    value: function(publicPrivate, memberName) { 
                        return this.FullName + '.' + this.type + '.' + 
                            publicPrivate + (memberName ? '.' + memberName : '');
                    }
                });

                // create merged instance proto and add to definition:
                def.InstanceProto = this.doMerge('Component endpoint `' + def.FullName + '.' + def.type + '`', 
                    'Private', 'Public', componentEndpoint.Private, componentEndpoint.Public) || {};

                // store actual public members in definition:
                def.Public = componentEndpoint.Public;

                // make sure that there is no mis-use with the instance methods by replacing them with error getters:
                fixPartialInstanceProto(componentEndpoint, 'Public');
                fixPartialInstanceProto(componentEndpoint, 'Private');
                    
                // finally, store shared endpoint in map
                sharedMap.addComponent(def.FullName, componentEndpoint);
            },
            
            /**
             * Create base & endpoint components from their definitions and merge them into a single object.
             * NOTE: If you change this, also make sure to check `bootstrapSelf`.
             */
            installComponent: function(sharedMap, componentDef, endpointName) {
                var baseDef = componentDef.Base;
                var endpointDef = componentDef[endpointName];
                var name = endpointDef.FullName;
                
                if (sharedMap[name]) {
                    throw new Error('Tried to install two Components with name `' + name + '`. Second installation ignored.');
                }
                
                try {
                    // call factory function
                    var base = baseDef ? this.createComponentFromDef(baseDef) : {};
                    var componentEndpoint = endpointDef ? this.createComponentFromDef(endpointDef) : {};
                    
                    // get & delete ctors before merging
                    var baseCtor = base.__ctor;
                    var endpointCtor = componentEndpoint.__ctor;
                    if (baseCtor) {
                        delete base.__ctor;
                    }
                    if (endpointCtor) {
                        delete componentEndpoint.__ctor;
                    }

                    console.assert(!componentEndpoint._def && !base._def, 'Component endpoint `' + name + '.' + endpointName + 
                        '` must not define a property named `_def`. It is a reserved property.');
                    
                    // merge and then store definition in _def
                    componentEndpoint = this.mergeBaseIntoComponentEndpoint(
                        endpointDef, endpointName, base, componentEndpoint);
                    
                    // call ctors
                    if (baseCtor) {
                        baseCtor.apply(componentEndpoint);
                    }
                    if (endpointCtor) {
                        endpointCtor.apply(componentEndpoint);
                    }
                    
                    // do some useful & necessary modifications on componentEndpoint
                    this.finishInstalledComponentEndpoint(componentEndpoint, base, sharedMap);
                
                    //console.log('Installed componentEndpoint: ' + name);
                    
                    return componentEndpoint;
                } 
                catch (err) {
                    var msg = 'Failed to install component endpoint: `' + name + '.' + endpointName + '` -- ' + err.stack;
                    console.error(msg);
                    throw new Error(msg);
                }
            },
            
            /**
             * Merge `Base` properties into Host/Client.
             */
            mergeBaseIntoComponentEndpoint: function(componentDef, nameTo, base, componentEndpoint) {
                // store base instance ctor separately, so it won't be overwritten
                var __baseCtor = base.Private && base.Private.__ctor;
                if (__baseCtor) {
                    base.Private.__baseCtor = base.Private.__ctor;
                    delete base.Private.__ctor;
                }

                // merge Base into endpoint
                var componentEndpoint = this.doMerge('Component `' + componentDef.FullName + '`', 'Base', 
                    nameTo, base, componentEndpoint, true);

                // set _def property
                Object.defineProperty(componentEndpoint, '_def', {
                    value: componentDef
                });
                return componentEndpoint;
            },
            
            /**
             * Copy all properties from object `from` to object `to`.
             */
            doMerge: function(ownerName, nameFrom, nameTo, from, to, allowOverrides, level) {
                level = level || 0;
                if (level > 12) {
                    throw new Error('Possible cyclic dependency when trying to merge component properties from `' +
                        nameFrom + '` to `' + nameTo + '`.');
                }

                if (from && to) {
                    // then, deep-merge the rest
                    for (var propName in from) {
                        if (!from.hasOwnProperty(propName)) continue;
                        var src = from[propName];
                        var dst = to[propName];
                        if (src && dst) {
                            // conflicting property
                            if (typeof(src) === 'object' && typeof(dst) === 'object') {
                                // nested object -> Merge recursively
                                to[propName] = this.doMerge(ownerName, 
                                    nameFrom + '.' + propName, 
                                    nameTo + '.' + propName, 
                                    src, dst, allowOverrides, level+1);
                            }
                            else if (!allowOverrides) {
                                // don't merge conflicting properties
                                throw new Error(ownerName + ' defines property `' + propName + '` in `' + nameFrom + '` and in `' + nameTo + 
                                    '`. That is not allowed, since `' + nameFrom + '` properties are merged into `' + nameTo + '` upon initialization.');
                            }
                            else {
                                // just override target
                                to[propName] = src;
                            }
                        }
                        else {
                            // no conflict
                            to[propName] = src;
                        }
                    }
                }
                else {
                    // nothing to merge
                    to = from || to;
                }
                return to;
            },


            // ################################################################################################################
            // Component initialization

            /**
             * This is called after all (thus far requested) components have been installed,
             * but before initClient/initHost is called.
             */
            onAfterAllComponentsInstalled: function(component) {
                Shared.Libs.ComponentInstance.onComponentInstallation(component);
            }
        };
    }),

    /**
     * Define the host-side logic of ComponentDef.
     */
    Host: HostCore.defHost(function(Tools, Shared) {
        // ##############################################################################################################
        // private static members
        
        var ClientDefs = function() { return {
            /**
             * All defs, indexed by name.
             */
            map: {},

            /**
             * The names of all defs (all keys of map)
             */
            names: [],

            /**
             * All defs in list form (all values of map)
             */
            list: [],
        };};

        var clientDefs = {
            Libs: ClientDefs(),
            Components: ClientDefs()
        };
        
        // #######################################################################################################################################
        // Load new component & setup commands

        /**
         * Do some general fixing-upping.
         * Then, collect command names of each side and store them in an array (`publicMembers`).
         */
        var fixComponentDefinition = function(componentDef, endpointName) {
            var fullEndpointName = componentDef.FullName + '.' + endpointName;
            var endpointDef = componentDef[endpointName];
            
            if (!endpointDef) {
                // Host or Client does not exist: Create a stub.
                var defFunName = 'def' + endpointName;
                componentDef[endpointName] = endpointDef = HostCore[defFunName](function() { return {}; });
            }
            
            // set name of actual component endpoint, so its available on both sides
            endpointDef.FullName = componentDef.FullName;

            // copy Includes
            endpointDef.Includes = componentDef.Includes;
            
            // initialize both endpoints once on the host (even the client)
            // This is the only way to get a hold of all command names.
            var endpoint;
            try {
                //endpoint = eval('(' + endpointDef.factoryFun.toString() + ')')();
                endpoint = endpointDef.factoryFun();
            }
            catch (err) {
                throw new Error('Unable to get commands from component. Make sure to place all setup & private code inside the `__ctor` function. ' +
                    'Do not execute any code outside of methods in a component definition. -- ' + err.stack);
            }
            
            var getFullPublicMemberName = function(memberName) { return fullEndpointName + '.Public.' + memberName; };
            
            // store all Public member names in array, so the other side knows what commands to send
            var publicMembers = endpointDef.publicMembers = [];
            if (!endpoint.Public) {
                endpoint.Public = {};
            }
            else {
                for (var memberName in endpoint.Public) {
                    if (!endpoint.Public.hasOwnProperty(memberName)) continue;
                    
                    var member = endpoint.Public[memberName];
                    
                    squishy.assert(typeof(member) === 'function', 
                        'Invalid `Public` member "' + getFullPublicMemberName(memberName) + '" is not a function. Public members must be functions.');
                    
                    // add command name
                    publicMembers.push(memberName);
                }
            }
        };
        
        /**
         * Install host side of component upon registration.
         */
        var installComponentOnHost = function(componentDef, clientDefs, map, creationFrame) {
            // get all command names and make them ready
            fixComponentDefinition(componentDef, 'Host');
            fixComponentDefinition(componentDef, 'Client');

            // add `File` and `Folder` to `Host` def
            componentDef.Host.File = creationFrame.fileName;
            componentDef.Host.Folder = path.dirname(creationFrame.fileName);
            
            // let each endpoint know all commands of the other side
            componentDef.Host.commandsClient = componentDef.Client.publicMembers;
            componentDef.Client.commandsHost = componentDef.Host.publicMembers;
            
            // add client def, which  is a copy of componentDef but without the Host part
            var clientDef = squishy.clone(componentDef);
            delete clientDef.Host;

            clientDefs.map[componentDef.FullName] = clientDef;
            clientDefs.names.push(componentDef.FullName);
            clientDefs.list.push(clientDef);
            
            // install and return host component
            return Shared.Libs.ComponentDef.installComponent(map, componentDef, 'Host');
        };

        /**
         * This function is the first thing to run on the client, and installs NoGap.
         */
        var installClientCode = CodeBuilder.serializeInlineFunction(function(clientData) {
            // due to some weird bug in chrome, we sometimes only get a meaningful stacktrace in the browser
            //    if we catch it through the global error handler, and often only after a second try.
            if (typeof(window) !== undefined) {
	            window.onerror = function(message, filename, lineno, colno, error) {
	                console.error('An error has occured. If you do not see a meaningful stacktrace, refresh once ' +
	                    '(the first raised error in the window usually does not stick the landing, at least in Chrome).');
	            };

	        	console.log('Bootstraping NoGap' + (window.top.document !== document ? ' (inside iframe)' : '') + '...');
	        }
	        else {
		        console.log('Bootstraping NoGap...');
		    }

	        // if (squishy.getGlobalContext().nogapInstalled)  {
	        // 	console.error(new Error('INTERNAL ERROR: NoGap tried to install itself twice.').stack);
	        // }
	        // squishy.getGlobalContext().nogapInstalled = 1;
    
            // get stuff from clientData
            var compDefData = clientData.compDefData;
            var cfg = compDefData.cfg;
            var libDefs = compDefData.libDefs;
        
            // get `the definition of ComponentDef`
            var ComponentDefDef = compDefData.ComponentDefDef;
            
            // bootstrap ComponentDef library
            var ComponentDef = compDefData.code.bootstrapSelf(ComponentDefDef, 'Client');
        
            // install library components
            var SharedComponents = ComponentDef.SharedComponents;
            ComponentDef.installClientComponents(libDefs, SharedComponents.Libs);

            // post-installation code
            ComponentDef.initClientComponents(libDefs, SharedComponents.Libs);

            // libs have been installed; now let ComponentBootstrap do the rest
            SharedComponents.Libs.ComponentBootstrap.onClientReady(clientData.bootstrapData);
            
            // return Shared object
            return SharedComponents;
        });
        
        
        return {
            // public members
            
            // ##############################################################################################################
            // def methods
            
            defBase: HostCore.defBase,
            defHost: HostCore.defHost,
            defClient: HostCore.defClient,

            __ctor: function() {
                this.clientDefs = clientDefs;
            },
            
            // ##############################################################################################################
            // component registration methods
            
            /**
             * Defines a new library component.
             * The biggest difference is that libraries are loaded and initialized before all other components.
             */
            lib: function(def) {
                return this.component(def, clientDefs.Libs, Shared.Libs, 2);
            },
            
            /**
             * Defines a new component with Host, Client and possible Base members.
             */
            component: function(def, defs, map, defStackDepth) {
                squishy.assert(def, 'Illegal component definition missing definition argument.');
                
                var name = def.Name;
                
                // no name supplied: Use stacktrace to guess file and thus, component name.
                var creationFrame;
                console.assert(def.Client || def.Base || def.Host, 
                    'Component definition is invalid. It must at least define one property named `Host`, `Client` or `Base`.');

                creationFrame = (def.Host || def.Client || def.Base).creationFrame;
                    
                if (!name && creationFrame) {
                    // deduct component name from filename
                    name = creationFrame.fileName;
                    name = name.substr(name.lastIndexOf('/') + 1);
                    if (name.endsWith('.js')) {
                        name = name.substring(0, name.length-3);
                    }
                    def.Name = name;
                }
                
                // TODO: Namespace considerations
                // var fullName = (def.Namespace ? (def.Namespace + ".") : "") + def.Name;
                
                var fullName = def.FullName = name;
                
                // get & validate Client definition
                var clientDef = def.Client;
                console.assert(!clientDef || (clientDef instanceof HostCore.FactoryDef && clientDef.type === 'Client'),
                    'Component definition has an invalid `Client` factory. Make sure that the `Client` property is declared with `Def.defClient(...)`.');
                
                
                // get & validate Base definition
                var baseDef = def.Base;
                console.assert(!baseDef || (baseDef instanceof HostCore.FactoryDef && baseDef.type === 'Base'),
                    'Component definition has an invalid `Base` factory. Make sure that the `Base` property is declared with `Def.defBase(...)`.');
                
                // get & validate Host definition
                var hostDef = def.Host;
                console.assert(!hostDef || (hostDef instanceof HostCore.FactoryDef && hostDef.type === 'Host'),
                    'Component definition has an invalid `Host` factory. Make sure that the `Host` property is declared with `Def.defHost(...)`.');
                
                // sanity checks:                
                // validate name (depends on client definition)
                console.assert(name, 'Unnamed component is illegal. Make sure to add a `Name` property to your component.');
                console.assert(creationFrame, 'INTERNAL ERROR: `creationFrame` was not defined when it should have been.');
                
                return installComponentOnHost(def, defs || clientDefs.Components, map || Shared, creationFrame);
            },
            
            
            // ##############################################################################################################
            // internal members
            
            /**
             * Do some final fixing-upping, and call `initHost` on installed components.
             */
            initializeHostComponents: function(app, cfg) {
                // fix up all shared component objects
                Shared.forEachComponentOfAnyType(function(component) {
                    this.onAfterAllComponentsInstalled(component)
                }.bind(this));

                // call initBase + initHost on all libs, with some special arguments
                Shared.Libs.forEach(function(component) {
                    if (component.initBase) {
                        component.initBase();
                    }
                    if (component.initHost) {
                        component.initHost(app, cfg);
                    }
                });
                
                // call initBase + initHost on all other components
                Shared.forEach(function(component) {
                    if (component.initBase) {
                        component.initBase();
                    }
                    if (component.initHost) {
                        component.initHost(app, cfg);
                    }
                });
            },
            
            /**
             * Returns the component installer function.
             * That function contains the code to install the components framework on a new client.
             *
             * @param {Object} bootstrapData The data to be given to ComponentBootstrap after ComponentDef took care of the basics.
             */
            getClientInstallCode: function(bootstrapData) {
                // define arguments of function call
                var compDefData = {
                    //define some code that is shared between client & host
                    code: {
                        bootstrapSelf: HostCore.bootstrapSelf
                    },

                    // add all library definitions
                    libDefs: clientDefs.Libs.list
                };

                // Add the ComponentDef library itself.
                // We must keep this one extra because we use this one to install the others.
                compDefData.ComponentDefDef = {
                    Base: ComponentDefDef.Base,
                    Client: ComponentDefDef.Client
                };

                // put the two argument sets into a single argument object
                var clientData = {
                    bootstrapData: bootstrapData,
                    compDefData: compDefData
                };

                // build installer function call with initializer data as argument
                return CodeBuilder.buildFunctionCall(installClientCode, clientData);
            },

            
            /**
             * Returns all non-library components of the given names.
             * Recursively adds all `Includes` of those components 
             * to the output and the given `componentNames` arrays.
             * Throws exception when coming across invalid component name.
             */
            getClientComponentDefsForDeployment: function(componentNames) {
                var defs = [];
                var uniqueNames = {};
                var queue = [];
                var iQueue = 0;

                // add requested component set to queue
                queue.push(componentNames);

                // BFS: Keep going until queue is empty
                while (queue.length > iQueue) {
                    var currentNames = queue[iQueue++];
                    for (var i = 0; i < currentNames.length; ++i) {
                        var componentName = currentNames[i];
                        
                        // ignore definition, if it has been added previously, to prevent circular inclusion
                        if (!uniqueNames[componentName]) {
                            var def = clientDefs.Components.map[componentName];
                            console.assert(def, 
                                'Invalid component requested for Client deployment - ' +
                                'It does not exist or does not have a `Client` definition: ' + 
                                componentName);

                            defs.push(def);
                            uniqueNames[componentName] = true;

                            if (iQueue > 1) {
                                // this component is not in the originally requested array -> Add it!
                                componentNames.push(componentName);
                            }

                            if (def.Includes) {
                                // add included components to queue
                                //this._getClientComponentDefsForDeployment(def.Includes, nDepth+1, defs, uniqueNames);
                                queue.push(def.Includes);
                            }
                        }
                    }
                }

                return defs;
            }
        };
    }),


    // ##################################################################################################################################################################
    // client-side definition

    /**
    * The client side of ComponentDef takes the host-side created ClientCode and installs it.
    */
    Client: HostCore.defClient(function(Tools, Instance, Context) {
        // NOTE: For this special (bootstrap) library, Components is undefined at this point.
        // Instead, it will be set in __ctor.
        
        return {
            // ########################################################################################
            // Set things up
            
            __ctor: function() {  
                Tools = this.Tools;
                Instance = this.SharedComponents;
            },
            
            /**
             * Installs all client components, whose def is given in the given `defs`.
             */
            installClientComponents: function(defs, map) {
                for (var i = 0; i < defs.length; ++i) {
                    var def = defs[i];
                    this.installComponent(map, def, 'Client');
                }
            },

            /**
             *
             */
            initClientComponents: function(defs, map) {
                // do some general stuff first
                for (var i = 0; i < defs.length; ++i) {
                    var endpointDef = defs[i].Client;
                    var comp = map[endpointDef.FullName];
                    this.onAfterAllComponentsInstalled(comp);
                }

                // then, call initBase + initClient on new components
                for (var i = 0; i < defs.length; ++i) {
                    var endpointDef = defs[i].Client;
                    var comp = map[endpointDef.FullName];
                    if (comp.initBase) {
                        comp.initBase();
                    }
                    if (comp.initClient) {
                        comp.initClient();   
                    }
                }
            },


            // ###################################################################################
            // public members of this ComponentDef's client site
        };
    })
};

// initialize & return the host side of the ComponentDef module
var _ComponentDef = HostCore.bootstrapSelf(ComponentDefDef, 'Host');

module.exports = _ComponentDef;