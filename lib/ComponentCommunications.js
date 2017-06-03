/**
 * This file defines the bottom layer of the component stack: The communication layer.
 */
"use strict";

var url = require('url');

var ComponentDef = require('./ComponentDef');
var process = require('process');
var _ = require('lodash');
 
/**
 * This interface sets the rules and structure for transport layer implementations.
 *
 * @interface
 */
var ComponentTransportImpl = {
    ImplName: "<short name describing implementation type>",
    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) { return {
        initHost: function(app, cfg) {},

        bootstrap: function(app, cfg) {},
        
        Private: {
        }
    }}),
    
    /**
     * This code will only execute on the client side of a component.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) { return {
        /**
         * This client-side function tells the host to execute the given command of the given component.
         */
        sendRequestToHost: function(clientMsg) {},

        Public: {
            refresh: function() {},

            redirect: function(newLocation, inOldContext) {}
        }
    }})
};


// ####################################################################################################################################
// ComponentCommunications

/**
 * This is the NoGap communication layer and manager of actual transport implementation.
 */
var ComponentCommunications = ComponentDef.lib({
    Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) { return {
        /**
         * PacketBuffer is used to keep track of all data while a
         * request or response is being compiled.
         * @see http://jsfiddle.net/h5Luk/15/
         */
        PacketBuffer: squishy.createClass(function() {
            this._resetBuffer();
        }, {
            // methods

            /**
             * Buffers the given command request.
             * Will be sent at the end of the current (or next) client request.
             * @return Index of command in command buffer
             */
            bufferCommand: function(compNameOrCommand, cmdName, args) {
                var command;
                if (_.isString(compNameOrCommand)) {
                    // arguments are command content
                    command = {
                        comp: compNameOrCommand,
                        cmd: cmdName,
                        args: args
                    };
                }
                else {
                    // first argument is complete command
                    command = compNameOrCommand;
                }

                // if buffering, just keep accumulating and send commands back later
                this._buffer.commands.push(command);

                // return packet index
                return this._buffer.commands.length-1;
            },

            /**
             * Add an array of commands to the buffer.
             */
            bufferClientCommands: function(commands) {
                this._buffer.commands.push.apply(this._buffer.commands, commands);
            },

            /**
             * Compile request or response data.
             * Includes all buffered commands, as well as given commandExecutionResults and errors.
             * Resets the current command buffer.
             */
            compilePacket: function(commandExecutionResults) {
                var packetData = this._buffer;
                packetData.commandExecutionResults = commandExecutionResults;
                this._resetBuffer();
                return packetData;
            },

            _resetBuffer: function() {
                this._buffer = { 
                    commands: [],
                    commandExecutionResults: null
                };
            },
        }),

        __ctor: function() {
            console.assert(this.PacketBuffer);
        },

        /**
         * Sets the charset for all transport operations.
         * The default transport implementation bootstraps NoGap to the browser and
         * uses this charset to populate the corresponding META tag.
         */
        setCharset: function(charset) {
            this.charset = charset;
        },

        _getComponentTransportImplName: function(name) {
            //return 'ComponentTransportImpl_' + name;
            return '_ComponentTransportImpl';
        },

        /**
         * The current transport layer implementation
         */
        getComponentTransportImpl: function() {
            var transportImpl = Shared.Libs[this._getComponentTransportImplName()];
            console.assert(transportImpl, 'Could not lookup the Host endpoint of the transport layer implementation.');
            return transportImpl;
        },

        /**
         * Creates a response packet, containing a single command
         */
        createSingleCommandPacket: function(compName, cmdName, args) {
             return {
                commands: [{
                    comp: compName,
                    cmd: cmdName,
                    args: args
                }]
            };
        },

        Private: {
            /**
             * This user's connection implementation state object
             */
            getDefaultConnection: function() {
                return this.Instance.Libs[this.ComponentCommunications._getComponentTransportImplName()];
            },

            /**
             * Get an identifier for the current user.
             * For network transport layers (such as HTTP or WebSocket), this is usually the IP address.
             * For WebWorkers and other kinds of environments that can be a custom name, assigned during
             * initialization.
             */
            getUserIdentifier: function() {
                return this.getDefaultConnection().getUserIdentifier();
            },

            refresh: function() {
                var connection = this.getDefaultConnection();
                if (connection.client) {
                    connection.client.refresh();
                }
                else {
                    connection.refresh();
                }
            },

            redirect: function(newLocation, inOldContext) {
                var connection = this.getDefaultConnection();
                if (connection.client) {
                    connection.client.redirect(newLocation, inOldContext);
                }
                else {
                    connection.redirect(newLocation, inOldContext);
                }
            }
        }
    }}),

    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var onNewConnection = function(conn) {
            // do nothing for now
        };

        var currentVersionToken;
    
        var Promise;
        var crypto;
        return {
            implementations: {},

            __ctor: function() {
                Promise = Shared.Libs.ComponentDef.Promise;
                crypto = require('crypto');
                
                this.events = {
                    connectionError: squishy.createEvent(this)
                };
            },

            generateRandomToken: function(len, symbols) {
                len = len || this.options.defaultLen;
                symbols = symbols || '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
                var nSymbols = symbols.length;
                var buf = crypto.randomBytes(len);
                var res = '';
                
                // only get `len` characters
                for (var i = 0; i < len; ++i) {
                    var nextByte = buf[i];
                    res += symbols[nextByte%nSymbols];      // map bytes to our given set of symbols
                }
                return res;
            },
            
            /**
             * Register a new endpoint implementation (e.g. using http-get, http-post, websockets, webworkers, or anything else...).
             */
            registerImplType: function(implType) {
                squishy.assert(typeof(implType) === 'object', 
                    'ComponentTransportImpl definition must implement the `ComponentTransportImpl` interface.');
                    
                squishy.assert(implType.ImplName, 'Unnamed ComponentTransportImpl is illegal. Make sure to set the `ImplName` property.');
                    
                // store it in implementations
                this.implementations[implType.ImplName] = implType;
            },
            
            /**
             * Initializes the host endpoint for the given hostComponents and registers the client endpoint.
             */
            setupCommunications: function(app, cfg) {
                // get implementation (HttpPost is the default)
                var implName = cfg.name || 'HttpPost';
                currentVersionToken = cfg.currentVersionToken || this.generateRandomToken(32);

                squishy.assert(this.implementations.hasOwnProperty(implName),
                    'ComponentTransportImpl of type "' + implName + 
                    '" does not exist. Available types are: ' + Object.keys(this.implementations));
                var implType = this.implementations[implName];

                // register implementation as lib (so we also get access to it on the client side)
                implType.Name = this._getComponentTransportImplName();
                ComponentDef.lib(implType);
            },

            /**
             * This should be called if there was any connection error.
             */
            reportConnectionError: function(req, res, err) {
                this.events.connectionError.fire(req, res, err);
            },

            getClientVersion: function(requestMetadata) {
                return requestMetadata['x-nogap-v'];
            },

            /**
             * An instance that has already been established sent a request.
             * Check if version matches.
             */
            isCurrentVersion: function(requestMetadata) {
                return this.getClientVersion(requestMetadata) === currentVersionToken;
            },


            Private: {
                /**
                 * Currently pending/executing Promise chain
                 */
                pendingResponsePromise: null,

                hostResponse: null,

                __ctor: function() {
                    this.hostResponse = new this.Shared.PacketBuffer();
                    this.pendingResponsePromise = Promise.resolve();
                },

                onNewClient: function() {
                    // a bit of security
                    this.updateClientIdentity(true, true);
                },

                /**
                 * CSRF prevention
                 * @see https://www.owasp.org/index.php/Cross-Site_Request_Forgery_(CSRF)_Prevention_Cheat_Sheet#General_Recommendation:_Synchronizer_Token_Pattern
                 */
                updateClientIdentity: function(dontSend, dontForce) {
                    if (!dontForce || !this.Context.session._identifierName) {
                        this.Context.session._identifierName = 'X-Nogap-Identity-' + this.Shared.generateRandomToken(16);
                        this.Context.session._identifierToken = this.Shared.generateRandomToken(32);

                        if (!dontSend) {
                            this.client.updateClientIdentityPublic({
                                identifierName: this.Context.session._identifierName,
                                identifierToken: this.Context.session._identifierToken,
                                v: currentVersionToken
                            });
                        }
                    }
                },

                getClientCtorArguments: function() {
                    return [{
                        identifierName: this.Context.session._identifierName, 
                        identifierToken: this.Context.session._identifierToken,
                        v: currentVersionToken
                    }];
                },


                // ##############################################################################################################
                // Handle requests

                /**
                 * Whether this instance is currently running/has pending promises
                 */
                isExecutingRequest: function() {
                    return this.pendingResponsePromise.isPending();
                },

                /**
                 * CSRF prevention
                 * @see https://www.owasp.org/index.php/Cross-Site_Request_Forgery_(CSRF)_Prevention_Cheat_Sheet#General_Recommendation:_Synchronizer_Token_Pattern
                 */
                verifyRPCRequestMetadata: function(requestMetadata) {
                    // check CSRF token
                    if (!this.Context.session._identifierName || !this.Context.session._identifierToken) {
                        return Promise.reject(makeError('error.internal', 
                            'Session client identifier was not properly initialized during client request'));
                    }

                    var sentToken = requestMetadata[this.Context.session._identifierName.toLowerCase()];
                    //console.error(this.Context.session._identifierName + ': ' + requestMetadata[this.Context.session._identifierName]);
                    if (sentToken === this.Context.session._identifierToken) {
                        return Promise.resolve();
                    }
                    return Promise.reject('Unverified client request (hasToken: ' + !!sentToken + ')');
                },

                /**
                 * Used by endpoint implementations to execute and/or put commands.
                 * @return A promise that will return the Host's response to the given clientMsg.
                 */
                handleClientRPCMsg: function(clientMsg) {
                    return this.executeCommandRequest(clientMsg.commands);
                },

                /**
                 * Used by endpoint implementations to execute and/or put commands.
                 * @return A promise that will return a (potentially empty) return value for each of the requested commands.
                 */
                executeCommandRequest: function(commands) {
                    // start (or enqueue) command request
                    var next = function() {
                        return this.Instance.Libs.CommandProxy.executeClientCommands(commands);
                    }.bind(this);

                    return this.executeInOrderWithReturnValue(next);
                },

                /**
                 * Execute the given function or promise once all pending requests have been served.
                 * Adds resulting client code to packet being compiled.
                 * Assumes that the code has no return value(s) to be sent to client.
                 * Given an HTTP implementation, this allows to buffer multiple sets of command executions.
                 * @return Promise for compiled hostResponse packet to be sent to client.
                 */
                executeInOrder: function(code) {
                    if (!this.pendingResponsePromise.isPending()) {
                        // queue is empty -> Start right away
                        // create new chain, so we don't keep all previous results until the end of time
                        this.pendingResponsePromise = Promise.resolve();
                    }

                    // if there is still other stuff pending -> Wait until it's finished
                    this.pendingResponsePromise = this.pendingResponsePromise
                    .then(code);

                    return this.pendingResponsePromise;
                },

                /**
                 * Execute the given function or promise once all pending requests have been served.
                 * @return Promise for final hostResponse packet to be sent to client.
                 */
                executeInOrderWithReturnValue: function(code) {
                    if (!this.pendingResponsePromise.isPending()) {
                        // queue is empty -> Start right away
                        // create new chain, so we don't keep all previous results until the end of time
                        this.pendingResponsePromise = Promise.resolve();
                    }

                    // if there is still other stuff pending -> Wait until it's finished
                    this.pendingResponsePromise = this.pendingResponsePromise
                    .then(code);

                    return this.pendingResponsePromise

                    // return client response, including commandExecutionResults
                    .then(this.hostResponse.compilePacket.bind(this.hostResponse));
                },

                /**
                 * Execute a piece of user code, wrapped in safety measures.
                 * Returns a promise, yielding the serialized result of the code execution.
                 */
                executeUserCodeAndSerializeResult: function(code) {
                    return Promise.resolve()
                    .bind(this)
                    .then(code)
                    .then(this.serializeRPCReturnValue.bind(this))
                    .catch(this.serializeRPCError.bind(this));
                },

                serializeRPCReturnValue: function(returnValue) {
                    // wrap return value
                    return {
                        value: returnValue,
                        err: null
                    };
                },

                serializeRPCError: function(err) {
                    // wrap error
                    this.Tools.handleError(err);
                    var isException = !!(err && err.stack);
                    return {
                        value: null,

                        // only send back error message if error has no stack (i.e. it was not raised locally)
                        err: isException && 'error.internal' || err
                    };
                },

                /**
                 * Return and reset current hostResponse buffer.
                 */
                compileHostResponse: function(returnValues) {
                    return this.hostResponse.compilePacket(returnValues);
                }

                // /**
                //  * Skip the queue and run given code right away, while buffering
                //  * all resulting commands to be sent back to client.
                //  */
                // executeCommandRaisingCodeNow: function(commandRaisingCode) {
                //     // override response buffer
                //     var originalBuffer = this.hostResponse;
                //     var newBuffer = this.hostResponse = new PacketBuffer();

                //     return Promise.resolve(commandRaisingCode)
                //     .bind(this)
                //     .then(function(commandExecutionResults) {
                //         // reset buffer
                //         this.hostResponse = originalBuffer;

                //         // give back response data to be sent to client
                //         return newBuffer.compilePacket(commandExecutionResults);
                //     });
                // },
            }
        };
    }),
    
    
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        var Promise;        // Promise library

        return {
            _requestPromise: null,
            _requestPacket: null,

            __ctor: function(clientIdentity) {
                this.updateClientIdentity(clientIdentity);

                Promise = Instance.Libs.ComponentDef.Promise;
                this._requestPacket = new this.PacketBuffer();
                this.events = {
                    refreshRequested: squishy.createEvent()
                };
            },

            updateClientIdentity: function(clientIdentity) {
                this._identity = clientIdentity;
            },

            initClient: function() {
                // add send method to Tools
                Tools.sendRequestToHost = function() {
                    var connection = this.getDefaultConnection();
                    var args = arguments;

                    return Promise.resolve()
                    .bind(this)

                    // first, send custom request to host
                    .then(function() {
                        return connection.sendRequestToHost.apply(connection, args);
                    })

                    // then handle response
                    .then(this.handleHostResponse)

                    // and interpret results
                    .then(function(results) {
                        return this.interpretHostResult(results);
                    });
                }.bind(this);
            },

            _getNogapComponentIds: function() {
                var componentIds = [];

                Instance.forEach(function(component) {
                    componentIds.push(component.Def.ComponentId);
                }.bind(this));

                return componentIds;
            },

            prepareRequestMetadata: function(metadata) {
                if (!this._identity.identifierName || !this._identity.identifierToken) {
                    throw new Error('error.internal: session client identifier was not initialized before client request');
                }
                metadata[this._identity.identifierName] = this._identity.identifierToken;
                metadata['x-nogap-v'] = this._identity.v;
                metadata['x-nogap-components'] = JSON.stringify(this._getNogapComponentIds());
            },


            /**
             * Add command to host, and send out very soon as part of a (small) batch.
             */
            sendCommandToHost: function(compName, cmdName, args) {
                // add command to buffer
                var returnIndex = this._requestPacket.bufferCommand(compName, cmdName, args);

                // do not send out every command on its own;
                // instead, always wait a minimal amount of time and then send
                // a batch of all commands together
                if (!this._requestPromise) {
                    this._requestPromise = Promise.delay(1)
                    .bind(this)
                    .then(this._sendClientRequestBufferToHost);
                }

                // send the corresponding return value back to caller
                return this._requestPromise
                .then(function(commandExecutionResults) {
                    var result = commandExecutionResults && commandExecutionResults[returnIndex];
                    return this.interpretHostResult(result);
                }.bind(this));
            },

            /**
             * Actually send Client request to Host.
             * Compile response packet for client; includes all buffered commands.
             * Resets the current commandBuffer.
             */
            _sendClientRequestBufferToHost: function() {
                this._requestPromise = null;        // reset promise

                // compile and send out data
                var clientMsg = this._requestPacket.compilePacket();
                return this.getDefaultConnection().sendRequestToHost(clientMsg)

                // once received, handle reply sent back by Host
                .then(this.handleHostResponse);
            },

            interpretHostResult: function(result) {
                if (!result) {
                    // nothing to return
                    return null;
                }
                else if (!result.err) {
                    // return result value
                    return result.value;
                }
                else {
                    // reject
                    return Promise.reject(result.err);
                }
            },

            /**
             * Host sent stuff. Run commands and return the set of returnValues.
             */
            handleHostResponse: function(hostReply) {
                if (hostReply.commands) {
                    // execute commands sent back by Host
                    Instance.Libs.CommandProxy.executeHostCommands(hostReply.commands);
                }

                // send return values sent by host back to callers
                return hostReply && hostReply.commandExecutionResults;
            },

            hasRefreshBeenRequested: function() {
                return this._refreshRequested;
            },

            Public: {
                updateClientIdentityPublic: function(clientIdentity) {
                    this.updateClientIdentity(clientIdentity);
                },

                /**
                 * Ask user if they want to refresh
                 */
                requestRefresh: function() {
                    this._refreshRequested = true;

                    this.events.refreshRequested.fire()
                    .bind(this)
                    .then(function() {
                        this.refresh();
                    })
                    .catch(function() {
                        // do nothing upon rejection
                    });
                }
            }
        };
    })
});

 
// ####################################################################################################################################
// HttpPost endpoint implementation

/**
 * Uses express + Ajax for transporting POST all NoGap data and requests.
 */
var HttpPostImpl = {
    ImplName: "HttpPost",

    Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) {
        return {
            /**
             * Default serializer implementation, uses JSON.
             */
            Serializer: {
                /**
                 * Convert an object into a string.
                 * TODO: Consider using ArrayBuffer instead.
                 */
                serialize: function(obj) {
                    return squishy.objToString(obj, true);
                },

                /**
                 * Reconstruct object from string.
                 * TODO: Consider using ArrayBuffer instead.
                 */
                deserialize: function(objString, evaluateWithCode) {
                    if (evaluateWithCode) {
                        return eval('(' + objString + ')');
                    }
                    return JSON.parse(objString);
                }
            },

            /** 
             * Asset handlers are given to the Assets library for initializing assets.
             */
            assetHandlers: {
                /**
                 * Functions to fix asset filenames of given types.
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
                 * Functions to generate code for including external file assets.
                 * Also need to fix tag brackets because this string will be part of a script 
                 * that actually writes the asset code to the HTML document.
                 *
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
                     * Unsupported format: Provide the include string as-is.
                     */
                    raw: function(fname) {
                        return fname;
                    }
                }
            },

            Private: {
                getUserIdentifier: function() {
                    if (SharedContext.IsHost) {
                        // host
                        var req = this._lastReq;
                        return this.Shared.getIpAddress(req);
                    }
                    else {
                        // Not Yet Implemented on Client
                        return null;
                    }
                },

                getCurrentConnectionState: function() {
                    return this._currentConnectionState;
                }
            }
        };
    }),
    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var express;
        var ExpressRouters = {};

        var serializer;
        return {
            __ctor: function() {
                express = require('express');

                serializer = this.Serializer;

                // add a tool to add custom route handler for other HTTP requests
                SharedTools.ExpressRouters = ExpressRouters = {
                    // handle routes before NoGap
                    before: express.Router(),

                    // handle routes after NoGap
                    after: express.Router()
                };
            },

            initHost: function(app, cfg) {
                // set charset
                this.charset = cfg.charset;

                // pre-build <script> & <link> includes
                this.includeCode = Shared.Libs.ComponentAssets.getAutoIncludeAssets(this.assetHandlers);
            },

            /**
             * After all components have been initialized, 
             * this will be called by ComponentBootstrap to register the NoGap HTTP middleware.
             */
            setupCommunications: function(app, cfg) {
                // Order of request handlers:
                //   1. patchConnectionState
                //   2. ExpressRouters.before
                //   3. Bootstrap handler
                //   4. RPC request handler
                //   5. ExpressRouters.after

                squishy.assert(app.use && app.get && app.post, 'Invalid argument for initHost: `app` is not an express or express router object. ' +
                    'Make sure to pass an express application object to `ComponentLoader.start` when using ' +
                    'NoGap\'s default HttpPost implementation.');

                // add custom methods to request
                this._registerConnectionPatcher(app, cfg);

                // register Instance initialization handler for bootstrap requests
                this._registerBootstrapRequestInitializer(app, cfg);

                // register Instance initialization handler for RPC requests
                this._registerRPCRequestInitializer(app, cfg);

                // handle "before" routes
                app.use(ExpressRouters.before);

                // handle bootstrap requests
                this._registerBootstrapRequestHandler(app, cfg);

                // handle RPC requests
                this._registerRPCRequestHandler(app, cfg);

                // handle "after" routes
                app.use(ExpressRouters.after);
            },

            getIpAddress: function(req) {
                // host
                var ipStr = null;
                if (req) {
                    // try to get IP
                    ipStr =  
                         (req.socket && req.socket.remoteAddress) ||
                         (req.connection && 
                            (req.connection.remoteAddress || 
                                (req.connection.socket && req.connection.socket.remoteAddress))) ||
                                req.headers['x-forwarded-for'];
                }
                else {
                    // no connection -> The call comes from inside the house (possibly via CommandPrompt)
                    ipStr = '<local>';
                }
                return ipStr;
            },

            _getOrCreateInstanceForSession: function(req, forceCreate) {
                var session = req.session;
                var sessionId = req.sessionID;
                console.assert(session,
                    'req.session was not set. Make sure to use a session manager before the components library, when using the default Get bootstrapping method.');
                console.assert(sessionId, 
                    'req.sessionID was not set. Make sure to use a compatible session manager before the components library, when using the default Get bootstrapping method.');
                
                // get or create Instance map
                var Instance = Shared.Libs.ComponentInstance.activateSession(
                    session, sessionId, forceCreate);

                // console.assert(Shared.Libs.ComponentInstance.activateSession(session, sessionId), 
                //     'Session activation failed.');
                return Instance;
            },

            _registerConnectionPatcher: function(app, cfg) {
                // patch general connection state
                app.use(function _patchConnectionState(req, res, next) {
                    // register error handler
                    var onError = function(err) {
                        Shared.Libs.ComponentCommunications.reportConnectionError(req, res, err);
                        next(err);
                    };
                    req.on('error', onError);

                    // patch req object
                    req.getInstance = function() {
                        var Instance = req.Instance;
                        if (!Instance) {
                            Instance = req.Instance = this._getOrCreateInstanceForSession(req, false);
                        }
                        return Instance;
                    }.bind(this);

                    req.runInContext = function(_userCode) {
                        var Instance = req.getInstance();
                        if (!Instance) {
                            // getInstance already took care of error handling
                            onError(new Error('runInContext failed - Instance not initialized'));
                            return;
                        }

                        var userCode = function() {
                            return _userCode(Instance);
                        };

                        return Instance.Libs.ComponentCommunications.executeInOrderWithReturnValue(function() {
                            // run user code and serialize error or return value
                            return Instance.Libs.ComponentCommunications.executeUserCodeAndSerializeResult(userCode);
                        })

                        // then send it back
                        .then(function(hostResponseData) {
                            var connection = Instance.Libs.ComponentCommunications.getDefaultConnection();
                            connection.sendRPCResponseToClient(hostResponseData, res);
                        });
                    };

                    // run next
                    next();
                }.bind(this));
            },

            _registerBootstrapRequestInitializer: function(router, cfg) {
                this._registerGetHandler(router, cfg, function(req, res, next) {
                    req.Instance = this._getOrCreateInstanceForSession(req, true);
                    next();
                }.bind(this));
            },

            _registerRPCRequestInitializer: function(router, cfg) {
                // register Instance initialization handler for RPC requests
                this._registerPostHandler(router, cfg, function(req, res, next) {
                    var requestMetadata = req.headers || {};

                    if (!Shared.Libs.ComponentCommunications.isCurrentVersion(requestMetadata)) {
                        // wrong version -> request Client refresh
                        var ipAddr = this.getIpAddress(req);
                        console.warn('[' + ipAddr + '] sent RPC request with outdated client version. Sending refresh.');

                        // Tell Client to refresh (assuming the client's currently running Bootstrapper implementation supports it):
                        var responsePacket = Shared.Libs.ComponentCommunications.createSingleCommandPacket(
                            'ComponentCommunications', 'requestRefresh');
                        this.Def.InstanceProto.sendRPCResponseToClient(responsePacket, res);
                        return null;
                    }

                    // first, try to get existing cached Instance
                    var Instance = req.Instance = this._getOrCreateInstanceForSession(req, false);
                    var notCached = !Instance;
                    if (notCached) {
                        // Instance not cached
                        console.error('reactivating instance for: ' + req.sessionID);

                        // create new Instance
                        Instance = req.Instance = this._getOrCreateInstanceForSession(req, true);
                    }

                    // verify Client integrity
                    var promise = 
                        Instance.Libs.ComponentCommunications.verifyRPCRequestMetadata(requestMetadata);

                    if (notCached) {
                        // call re-initialization code in order
                        promise = promise.then(
                            Instance.Libs.ComponentCommunications.executeInOrder.bind(Instance.Libs.ComponentCommunications, function() {

                            // reactivate
                            var componentIdStr = requestMetadata['x-nogap-components'];
                            var componentIds;
                            try {
                                componentIds = JSON.parse(componentIdStr);
                                console.assert(componentIds instanceof Array);
                            }
                            catch (err) {
                                next('Could not parse `x-nogap-components` header: ' + componentIdStr);
                                return;
                            }

                            var ComponentBootstrapInstance = Instance.Libs.ComponentBootstrap;
                            return Instance.Libs.ComponentBootstrap.reactivateClientInstanceNow(componentIds)
                            .catch(ComponentBootstrapInstance.Tools.handleError
                                        .bind(ComponentBootstrapInstance.Tools));
                        })); 
                    }

                    // once its all done, execute next middleware layer
                    promise
                    .then(function() { next(); });
                }.bind(this));
            },

            /**
             * Register HTTP middleware to handle Client bootstrap requests (GET)
             */
            _registerBootstrapRequestHandler: function(router, cfg) {
                this._registerGetHandler(router, cfg, function(req, res, next) {
                    console.log('[' + this.getIpAddress(req) + '] Incoming client requesting `' + req.url + '`');
                    
                    // handle the request
                    var Instance = req.getInstance();
                    var connection = Instance.Libs.ComponentCommunications.getDefaultConnection();
                    connection._currentConnectionState = res;
                    connection._lastReq = req;

                    var ComponentBootstrapInstance = Instance.Libs.ComponentBootstrap;

                    // bootstrap the new Instance
                    return connection._doBootstrapClientInstance(req, res, next)
                    .bind(this)

                    // send bootstrap code to Client and kick things of there
                    .then(function(codeString) {
                        connection._sendBootstrapRequestToClient(res, codeString);
                    })

                    // could not send out the response
                    .catch(ComponentBootstrapInstance.Tools.handleError
                                .bind(ComponentBootstrapInstance.Tools))

                    .finally(function() {
                        connection._currentConnectionState = null;
                    });
                }.bind(this));
            },

            /**
             * Register HTTP middleware to handle Client RPC requests (POST)
             */
            _registerRPCRequestHandler: function(router, cfg) {
                this._registerPostHandler(router, cfg, function(req, res, next) {

                    // handle the request
                    var Instance = req.getInstance();
                    var connection = Instance.Libs.ComponentCommunications.getDefaultConnection();
                    connection._currentConnectionState = res;
                    connection._lastReq = req;

                    // extract body data
                    // see: http://stackoverflow.com/a/4310087/2228771
                    var body = '';
                    req.on('data', function (data) {
                        body += data;
                    });
                    req.on('end', function () {
                        // execute RPC request and send host's response back to client
                        Promise.resolve()
                        .then(function() {
                            return connection.handleClientRPCString(body, res);
                        })
                        .finally(function() {
                            connection._currentConnectionState = null;
                        });
                    }.bind(this));
                }.bind(this));
            },

            _registerGetHandler: function(router, cfg, cb) {
                router.get(cfg.baseUrl + "*", cb);
            },

            _registerPostHandler: function(router, cfg, cb) {
                router.post(cfg.baseUrl, cb);
            },

            Private: {
                __ctor: function() {
                },

                getClientCtorArguments: function() {
                    console.assert(this.Context.clientAddress, 'INTERNAL ERROR: clientRoot has not been set by ComponentBootstrap.');

                    // Make sure that client knows where to send its AJAX requests.
                    // If we don't have that, the client side of the component framework does not know how to send commands.
                    return [{
                        remoteAddress: this.Context.clientAddress,
                        remoteUrl: this.Context.clientRoot,
                        charset: this.Shared.charset
                    }];
                },

                onClientBootstrap: function() {
                    // assign remoteUrl to context
                    this.Context.remoteUrl = this.Context.clientRoot;
                },

                _doBootstrapClientInstance: function(req, res, next) {
                    // store some client information
                    var clientRoot = req.protocol + '://' + req.get('host');
                    var clientAddress = req.connection.remoteAddress;
                    var isLocalConnection = clientAddress === 'localhost' || clientAddress === '127.0.0.1' || clientAddress === '::1';
                    
                    this.Context.clientAddress = clientAddress;
                    this.Context.clientIsLocal = isLocalConnection;
                    this.Context.clientRoot = clientRoot;
                    this.Context.clientNoHtml = req.headers['x-nogap-nohtml'];

                    console.time('boostrapping took');

                    // install new instance and generate client-side code
                    var ComponentBootstrapInstance = this.Instance.Libs.ComponentBootstrap;
                    return ComponentBootstrapInstance.bootstrapComponentInstance()
                    .bind(this)

                    .catch(function(err) {
                        // something went wrong
                        //debugger;
                        ComponentBootstrapInstance.Tools.handleError(err);

                        // error!
                        next(err);
                    })

                    .then(function(codeString) {
                        // send bootstrap code to Client and kick things of, there
                    console.timeEnd('boostrapping took');
                        return codeString;
                    });
                },

                _sendBootstrapRequestToClient: function(res, codeString) {
                    // determine charset
                    var charset = (this.charset || 'UTF-8');

                    // send out bootstrapping page to everyone who comes in:
                    if (this.Context.clientNoHtml) {
                        // specialized client -> Only send JS code (JSON-formatted)
                        res.writeHead(200, {'Content-Type': 'application/json'});
                        res.write(codeString);
                    }
                    else {
                        // browser client (HTML)

                        // escape </script> tags in bootstrapping JS code
                        codeString = codeString.replace(/<\/script>/g, '\\x3c/script>');
                        codeString = JSON.stringify(codeString);

                        res.writeHead(200, {'Content-Type': 'text/html'});
                        res.write('<!doctype html>\n<html><head>');

                        // see: http://stackoverflow.com/questions/19156510/bootstrap-3-responsive-not-working-on-mobile
                        res.write('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">');

                        // see: http://www.w3schools.com/tags/att_meta_charset.asp
                        res.write('<meta charset="' + charset + '" />');

                        // write CSS + JS external files
                        res.write(this.Shared.includeCode);

                        // done with head
                        res.write('</head><body>');

                        // write NoGap bootstrapping code
                        res.write('<script type="text/javascript" charset="' + charset + '">');
                        res.write('eval(eval(' + codeString + '))');
                        res.write('</script>');

                        // wrap things up
                        res.write('</body></html>');
                    }
                    res.end();
                },

                _serializeAndSendError: function(err, connectionState) {
                    var hostResponseData = [this.Instance.Libs.ComponentCommunications.serializeRPCError(err)];
                    return this.Instance.Libs.ComponentCommunications.executeInOrderWithReturnValue(function() {
                        return hostResponseData;
                    })
                    .bind(this)
                    .then(function(packet) {
                        this.sendRPCResponseToClient(packet, connectionState);
                    });
                },

                handleClientRPCString: function(requestString, connectionState) {
                    var msg;
                    try {
                        msg = serializer.deserialize(requestString);
                    }
                    catch (err) {
                        // empty request is invalid
                        var maxLen = 800;
                        if (requestString.length > maxLen) {
                            // truncate to at most maxLen characters
                            requestString = requestString.substring(0, maxLen) + '...';
                        }
                        err = new Error('Invalid data sent by client cannot be parsed: ' + 
                            requestString + ' -- Error: ' + err.message || err);

                        this._serializeAndSendError(err, connectionState);
                        return;
                    }
                    
                    if (!msg) {
                        // empty request is invalid
                        this._serializeAndSendError(new Error('Empty client request'), connectionState);
                        return;
                    }
                    
                    // handle the request
                    return this.handleClientRPCMsg(msg, connectionState);
                },

                handleClientRPCMsg: function(msg, connectionState) {
                    var Tools = this.Instance.Libs.ComponentCommunications.Tools;
                    
                    // Execute commands.
                    // Once finished executing, `sendRPCResponseToClient` will be called 
                    //      with the response packet to be interpreted on the client side.
                    return this.Instance.Libs.ComponentCommunications.handleClientRPCMsg(msg)
                    .then(function(hostResponseData) {
                        this.sendRPCResponseToClient(hostResponseData, connectionState);
                    }.bind(this))

                    // catch and handle any error
                    .catch(Tools.handleError.bind(Tools));
                },

                /**
                 * This Host-side function is called when a bunch of Client commands are to be sent to Client.
                 */
                sendRPCResponseToClient: function(hostResponseData, connectionState) {
                    // connectionState == HtppResponse object
                    console.assert(connectionState, 'Tried to call `sendRPCResponseToClient` without `connectionState` connection state object.');

                    // if response object is given, send right away
                    var hostResponseString;
                    try {
                        // Serialize
                        hostResponseString = serializer.serialize(hostResponseData);
                    }
                    catch (err) {
                        // produce pruned string representation
                        var commStr = squishy.objToString(hostResponseData, true, 3);

                        connectionState.statusCode = 500;
                        connectionState.end();

                        // then report error
                        throw new Error(
                            '[NoGap] Invalid remote method call: Tried to send too complicated object. ' + 
                            'Arguments to remote methods must be simple objects or functions (or a mixture thereof).\n' +
                            'Failed commands:\n ' + commStr + '. ' );
                    }

                    // flush response & close connection
                    connectionState.contentType('application/json');
                    connectionState.setHeader("Access-Control-Allow-Origin", "*");
                    connectionState.write(hostResponseString);

                    connectionState.end();
                    this._currentConnectionState = null;
                },
            }
        };
    }),
    
    /**
     * This code will only execute on the client side of a component.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        var cfg;
        var serializer;
        var Promise;

        return {
            __ctor: function(_cfg) {
                cfg = _cfg;

                // store in Context
                Context.remoteAddress = cfg.remoteAddress;
                Context.remoteUrl = cfg.remoteUrl;
                Context.charset = cfg.charset;

                Context.clientIsLocal = cfg.remoteAddress === 'localhost' || cfg.remoteAddress === '127.0.0.1' || cfg.remoteAddress === '::1';

                Promise = Instance.Libs.ComponentDef.Promise;
                serializer = this.Serializer;
            },

            onBeforeSendRequestToHost: function(options) {
            },

            /**
             * This client-side function is called when a host command is called from a client component.
             * It will transport the commands to the host, wait for the reply, and then execute the commands that were sent back.
             */
            sendRequestToHost: function(clientMsgData, path, dontSerialize, requestMetadata) {
                path = path || '';

                var ComponentCommunications = Instance.Libs.ComponentCommunications;
                if (ComponentCommunications.hasRefreshBeenRequested()) {
                    // already out of sync with server
                    return Promise.reject('Tried to send request to server, but already out of sync');
                }

                // add security and other metadata, required by NoGap
                requestMetadata = requestMetadata || {};
                ComponentCommunications.prepareRequestMetadata(requestMetadata);

                var options = {
                    clientMsgData: clientMsgData,
                    path: path,
                    dontSerialize: dontSerialize,
                    requestMetadata: requestMetadata
                };

                return Promise.resolve()
                .bind(this)
                .then(function() {
                    return this.onBeforeSendRequestToHost(options);
                })
                .then(function() {
                    return this.sendRequestToHostImpl(options);
                })
                .then(function(replyText) {
                    replyText = replyText || '';

                    // host sent hostReply back, in response to our execution request
                    var hostReply;
                    try {
                        // Deserialize
                        hostReply = serializer.deserialize(replyText, true) || {};
                    }
                    catch (err) {
                        console.error(err.stack);

                        // TODO: Better error handling
                        err = 'Unable to parse reply sent by host. '
                            + 'Check out http://jsonlint.com/ for more information: \n'
                            + responseText;
                        return Promise.reject(err);
                    }

                    // return host-sent data to caller
                    return hostReply;
                });
            },

            sendRequestToHostImpl: function(options) {
                var clientMsgData = options.clientMsgData;
                var path = options.path;
                var dontSerialize = options.dontSerialize;
                var requestMetadata = options.requestMetadata;


                var promise = new Promise(function(resolve, reject) {
                    // send Ajax POST request (without jQuery)
                    var xhReq = (typeof(XMLHttpRequest) !== 'undefined') ? new XMLHttpRequest() : 
                        ((typeof(ActiveXObject) !== 'undefined') && new ActiveXObject("Microsoft.XMLHTTP"));

                    if (!xhReq) {
                        throw new Error('Could not `sendRequestToHost` - `XMLHttpRequest` is not available.');
                    }
                    
                    // send out the command request
                    //console.log(cfg.remoteUrl);
                    xhReq.open('POST', cfg.remoteUrl + path, true);
                    if (!dontSerialize) {
                        xhReq.setRequestHeader('Content-type','application/json; charset=' + (cfg.charset || 'utf-8') + ';');
                        clientMsgData = serializer.serialize(clientMsgData);
                    }
                    for (var headerName in requestMetadata) {
                        xhReq.setRequestHeader(headerName, requestMetadata[headerName]);
                    }

                    //xhReq.setRequestHeader('Content-type','application/json');
                    xhReq.onerror = function() {
                        // TODO: Better error handling
                        // network-level failure
                        var err = new Error('connection error');
                        reject(err);
                    };

                    xhReq.onreadystatechange = function() {
                        if (xhReq.readyState != 4) return;
                        
                        if (xhReq.status==200) {
                            // success! Interpret host results!
                            resolve(xhReq.responseText);
                        }
                        else {
                            // TODO: Better error handling
                            // application-level failure
                            var err;
                            if (xhReq.status) {
                                var msg = xhReq.responseText || 'error.internal';
                                console.error('Invalid response from host - [' + xhReq.status + '] ' + msg);
                                err = msg;
                            }
                            else {
                                // connection probably got interrupted
                                var err = new Error('error.connection.lost');
                            }
                            reject(err);
                        }
                    };
                    
                    // send request
                    xhReq.send(clientMsgData);
                });

                return promise;
            },

            Public: {
                refresh: function() {
                    // refresh page
                    console.log('Page refresh requested. Refreshing...');
                    window.location.reload();
                },

                redirect: function(newLocation, inOldContext) {
                    // open new location (really: a URL)
                    window.open(newLocation, inOldContext ? null : '_blank');
                }
            },
        };
    })
};

// register default implementation types:
ComponentCommunications.registerImplType(HttpPostImpl);

module.exports = ComponentCommunications;