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
            var errString = err && err.stack || err || '';

            var msg = (message && (message + (!!errString.length && ' - ' || '')) || '') + errString;
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

                if (squishy.envIsNode()) {
                    // Node

                    /**
                     * Initialize (require) a (single-file!) Node module from a string in memory.
                     * @see http://stackoverflow.com/questions/17581830/load-node-js-module-from-string-in-memory
                     */
                    SharedTools.requireFromString = function(src, filename) {
                        var m = new module.constructor();
                        m.paths = module.paths;
                        m._compile(src, filename);

                        // // sadly, we can't support multi-file modules because every `require` call checks against the fs for a real file
                        // if (virtualPath) {
                        //     var cacheKey = JSON.stringify({request: filename, paths: paths});
                        //     module._cache[filename] = m;
                        // }

                        return m.exports;
                    };
                }
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

            Monitor: function(timeoutMillis) {
                timeoutMillis = timeoutMillis || 1000;

                var resolve, reject;
                var isResolved = false, err, result;

                var promise = new Promise(function(_resolve, _reject) {
                    if (isResolved) {
                        if (err) {
                            _reject(err)
                        }
                        else {
                            _resolve(result);
                        }
                    }
                    else {
                        resolve = _resolve;
                        reject = _reject;
                    }
                });

                // make sure, promise will be fulfilled
                if (timeoutMillis >= 0) {    // negative value means: no timeout
                    setTimeout(function() {
                        if (!isResolved) {
                            this.notifyReject('timeout');
                        }
                    }.bind(this), timeoutMillis);
                }

                this.wait = promise;
                this.notifyResolve = function(_result) {
                    if (isResolved) return;
                    isResolved = true;

                    if (resolve) {
                        resolve(_result);
                    }
                    else {
                        // remember result until Promise ctor callback is called
                        result = _result;
                    }
                    return promise;
                };
                this.notifyReject = function(_err) {
                    if (isResolved) return;
                    isResolved = true;

                    if (reject) {
                        reject(_err);
                    }
                    else {
                        // remember result until Promise ctor callback is called
                        err = _err;
                    }
                    return promise;
                };
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

            Private: {
                __ctor: function() {
                    this._lastPendingOperationId = 0;
                    this._pendingOperations = {};
                },

                /**
                 * Call given client method and return a promise on it's return value.
                 */
                callClientMethodAsync: function(componentName, methodName, args, pollingDelayMillis, pollingTimeoutMillis) {
                    // register pending operation
                    var operation = {
                        id: ++this._lastPendingOperationId,
                        command: {
                            comp: componentName,
                            cmd: methodName,
                            args: args
                        }
                    };
                    this._pendingOperations[operation.id] = operation;

                    var This = this;

                    pollingDelayMillis = pollingDelayMillis || 5;
                    pollingTimeoutMillis = pollingTimeoutMillis || 3000;

                    var totalWeightTime = 0;
                    var intervalTimer;

                    return new Promise(function(resolve, reject) {
                        // poll for result
                        intervalTimer = setInterval(function() {
                            var result = operation.result;
                            totalWeightTime += pollingDelayMillis;
                            if (totalWeightTime > pollingTimeoutMillis) {
                                // timeout hit! -> client failed to ACK on time
                                reject('error.operation.timeout');
                                return;
                            }

                            if (result === null) return;    // nothing happened yet

                            if (result.error) {
                                // error
                                reject(result.error);
                            }
                            else {
                                // all good!
                                resolve(result.value);
                            }
                        }, pollingDelayMillis);
                    })
                    .bind(this)
                    .finally(function() {
                        // done! Stop timer
                        if (intervalTimer) {
                            clearInterval(intervalTimer);
                            intervalTimer = null;
                        }

                        // delete pending operation
                        delete this._pendingOperations[operation.id];
                    });

                    // send to client
                    this.client.executeOperationAndSendBackReturnValue(operation);
                },
            },
            
            Public: {
                operationAck: function(result) {
                    var operation = this._pendingOperations[result.id];
                    if (!operation) return Promise.reject('error.operation.notPending');

                    // set result, so it will be picked up by the polling above
                    operation.result = result;

                    // delay until caller finished
                    return new Promise(function(resolve, reject) {
                        var waitTimer = setInterval(function() {
                            if (!this._pendingOperations[result.id]) {
                                // done!
                                clearInterval(waitTimer);
                                resolve();
                            }
                        }, 5);
                    });
                }
            }
        };
    }),


    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        var ThisComponent;
        return {
            __ctor: function() {
                ThisComponent = this;
            },

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
                executeOperationAndSendBackReturnValue: function(operation) {
                    return Promise.resolve()
                    .then(function() {
                        return Instance.Libs.CommandProxy.executeHostCommand(operation.command);
                    })
                    .then(function(value) {
                        return {
                            id: operation.id,
                            value: value,
                            error: null
                        };
                    })
                    .catch(function(err) {
                        return {
                            id: operation.id,
                            value: null,
                            error: err
                        };
                    })
                    .then(function(result) {
                        ThisComponent.host.operationAck(result);
                    });
                }
            }
        };
    }),
});