/**
 * This file provides the Tools objects. The tools object lets you 
 * conveniently perform component-related operations inside components.
 */
 "use strict";

 var ComponentDef = require('./ComponentDef');

 module.exports = ComponentDef.lib({
    Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) {

        /**
         * Default error handler implementation
         */
        var _onError = function(Instance, err, message) {
            //var isException = err && err.stack;
            var errString = err && err.stack || err;

            var msg = (message && (message + ' - ') || '') + errString;
            console.error(msg);
        };

        return {
            TraceCfg: {
                enabled: true,
                maxArgsLength: 120
            },

            /**
             * This must be called from different stages of the intialization process in Client and Host!
             */
            _initSharedTools: function() {
                // add Promise library from ComponentDef
                this.Promise = Shared.Libs.ComponentDef.Promise;

                // bind all methods
                this.bindAllMethodsToObject(this);

                // merge this into `SharedTools` object
                squishy.mergeWithoutOverride(SharedTools, this);
            },


            /** 
             * Bind all member functions of an object to the object itself.
             */
             bindAllMethodsToObject: function(obj) {
                for (var memberName in obj) {
                    if (!obj.hasOwnProperty(memberName)) continue;
                    var member = obj[memberName];
                    if (member instanceof Function) {
                        obj[memberName] = member.bind(obj);
                    }
                }
            },

            functionCallToString: function(functionName, args) {
                var argsString = args ? JSON.stringify(args) : '';
                if (argsString.length > this.TraceCfg.maxArgsLength) {
                    argsString = argsString.substring(0, this.TraceCfg.maxArgsLength) + '...';
                }
                return functionName + '(' + argsString + ')';
            },


            Private: {
                getUserIdentifierImpl: function() {
                    // ask communication layer for an identifier
                    var userId = this.Instance.Libs.ComponentCommunications.getUserIdentifier();
                    return userId;
                },

                onError: function(err, message) {
                    _onError(this, err, message);
                },

                requestClientComponents: function(componentNames) {
                    if (!(componentNames instanceof Array)) {
                        componentNames = Array.prototype.slice.call(arguments, 0);  // convert arguments to array
                    }
                    return this.Instance.Libs.ComponentBootstrap.requestClientComponents(componentNames);
                },

                 /**
                  * Tell client to refresh current page.
                  */
                refresh: function() {
                    this.Instance.Libs.ComponentCommunications.refresh();
                },


                // ############################################################################################################
                // User-specific logging

                formatUserMessage: function(message) {
                    var userId = this.getUserIdentifierImpl();
                    var prefix = '';
                    if (userId) {
                        prefix = '[' + userId + '] ';
                    }
                    return prefix + message;
                },

                /**
                 * 
                 */
                log: function(message) {
                    message = this.formatUserMessage(message);
                    console.log(message);
                },

                logWarn: function(message) {
                    message = this.formatUserMessage(message);
                    console.warn(message);
                },

                /**
                 * Default error handler.
                 * Can be overwritten.
                 */
                handleError: function(err, message) {
                    try {
                        this.onError(err, message);
                    }
                    catch (newErr) {
                        // error handling -> Make sure it always works or we simply won't see what's really happening!
                        console.error('Logging failed: ' + newErr && newErr.stack || newErr);
                        _onError(this.Instance, new Error(err && err.stack || err));
                    }
                },


                // ############################################################################################################
                // User-specific tracing

                traceLog: function(message) {
                    if (!this.Shared.TraceCfg.enabled) return;
                    this.log('[TRACE] ' + message);
                },

                traceFunctionCall: function(functionName, args) {
                    if (!this.Shared.TraceCfg.enabled) return;
                    this.traceLog('calling ' + this.Shared.functionCallToString(functionName, args));
                },

                traceComponentFunctionCall: function(componentName, functionName, args) {
                    if (!this.Shared.TraceCfg.enabled) return;
                    this.traceFunctionCall(componentName + '.' + functionName, args);
                },

                traceComponentFunctionCallFromSource: function(source, componentName, functionName, args) {
                    if (!this.Shared.TraceCfg.enabled) return;
                    this.traceFunctionCall('[from ' + source + '] ' + componentName + '.' + functionName, args);
                },
            }
        };
    }),

    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        return {
            __ctor: function() {
                this._initSharedTools();
            },

            initHost: function() {
                // add some shared tools
            },

            /**
             * Create instance Tools object.
             */
            createInstanceTools: function(Instance) {
                // use an UGLY hack for now
                // TODO: This sort of initilization is necessary so the Tools instance is ready before we start
                //      getting into the dirty details of it all.
                //      BUT! it leaves the Tools object in an unfinished and totally broken state... o_X
                //var tools = Object.create(this.Def.InstanceProto);
                // tools.Instance = Instance;
                // tools.Shared = this;

                var tools = Instance.Libs.ComponentTools;
                SharedTools.bindAllMethodsToObject(tools);      // bind all methods

                return tools;
            },
            
            Public: {
            }
        };
    }),


    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        return {

            initClient: function() {
                this.initClient = null;
            },

             /**
              * Refresh current page.
              */
            refresh: function() {
                Instance.Libs.ComponentBootstrap.refresh();
            },

            Private: {
                __ctor: function() {
                    this._initSharedTools();
                }
            },

            /**
             * Client commands can be directly called by the host
             */
            Public: {
            }
        };
    }),
});