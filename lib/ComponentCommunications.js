/**
 * This file defines the bottom layer of the component stack: The communication layer.
 */
"use strict";

var url = require('url');

var ComponentDef = require('./ComponentDef');
 
/**
 * This interface sets the rules and structure for transport layer implementations.
 *
 * @interface
 */
var ComponentEndpointImpl = {
    ImplName: "<short name describing implementation type>",
    
    Host: ComponentDef.defHost(function(Tools, Shared) { return {
        initHost: function(app, cfg) {},
        
        Private: {
            /**
             * This host-side function tells the given client to execute the given command of the given component.
             */
            sendCommandsToClient: function(commands, connectionState) {},

            /**
             * Whether this implementation is always open (like websockets),
             * or whether it needs to explicitly requested to `keepOpen` and buffer command requests (like HttpPost).
             */
            staysOpen: function() {}
        }
    }}),
    
    /**
     * This code will only execute on the client side of a component.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) { return {
    
        Private: {
            /**
             * This client-side function tells the host to execute the given command of the given component.
             */
            sendCommandsToHost: function(commands) {},
        }
    }})
};


// ####################################################################################################################################
// ComponentCommunications

/**
 * This is the NoGap communication layer and manager of actual transport implementation.
 */
var ComponentCommunications = ComponentDef.lib({
    Base: ComponentDef.defBase(function(Tools, Shared) { return {
        getImplComponentLibName: function(name) {
            //return 'ComponentEndpointImpl_' + name;
            return 'ComponentEndpointImpl';
        },

        createSingleCommandPacket: function(compName, cmdName, args) {
             return [{
                comp: compName,
                cmd: cmdName,
                args: args
            }];
        },

        Private: {
            getDefaultConnection: function() {
                return this.Instance.Libs[this.ComponentCommunications.getImplComponentLibName()];
            }
        }
    }}),
    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var traceKeepOpenDepth;

        var trace = function(name) {
            //console.log(new Error(name).stack);
            //console.log(name);
        };

        var traceKeepOpen = function(which, nKeptOpen) {
            // use a bit of magic to reduce the amount of stackframes displayed:
            // Apply heuristics to ommit frames, originating from NoGap, internally
            var frames = squishy.Stacktrace.getStackframesNotFromPath(__dirname);
            var str = which + ' #' + nKeptOpen;
            if (!frames) {
                // internal call
                str += ' (internal)';
            }
            else {
                // call from user-code
                str += ' @';
                var n = Math.min(traceKeepOpenDepth, frames.length);
                for (var i = 0; i < n; ++i) {
                    var frame = frames[i];
                    str += frame.fileName + ':' + frame.row + ':' + frame.column + '\n';
                };
            }
            console.log(str);
        };

        var onNewConnection = function(conn) {
            // do nothing for now
        };

        /**
         * A queue of command requests prevents crossing wires between two different sets of requests.
         */
        var CommandList = squishy.createClass(
            function(instance, name) {
                this.instance = instance;
                this.name = name;
                this.arr = [];
            },{
                put: function(cb) {
                    this.arr.push(cb);
                },
                
                /**
                 * Check if the given action can be executed now or enqueue/push it until it is safe to
                 * be run inside this instance's context.
                 */
                executeInOrder: function(cb, movesNext) {
                    if (this.instance.isBuffering()) {
                        // still executing a command: Queue the request.
                        this.put(cb);
                    }
                    else {
                        // go right ahead
                        this.instance.executeCbNow(cb);
                        if (!movesNext) {
                            this.instance.moveNext();
                        }
                    }
                },

                /**
                 * Check if there are more callbacks in this list, and if so, call the next one.
                 */
                moveNext: function() {
                    var cb = this.remove();
                    //trace(new Error('moveNext').stack);
                    trace('moveNext');
                    if (cb) {
                        this.instance.executeCbNow(cb);
                        return true;
                    }
                    return false;
                },
        });

        var CommandQueue = squishy.extendClass(CommandList, 
            function(instance, name) {
                this._super(instance, name);
            },{
            /**
             * Remove and return oldest cb.
             */
            remove: function() {
                if (this.arr.length == 0) return null;

                var cb = this.arr[0];
                this.arr.splice(0, 1);
                return cb;
            },
        });

        var CommandStack = squishy.extendClass(CommandList, 
            function(instance, name) {
                this._super(instance, name);
            },{
            /**
             * Remove and return youngest cb.
             */
            remove: function() {
                if (this.arr.length == 0) return null;

                var cb = this.arr[this.arr.length-1];
                this.arr.splice(this.arr.length-1, 1);
                return cb;
            },
        });
    
        return {
            implementations: {},

            __ctor: function() {
                this.events = {
                    connectionError: squishy.createEvent(this)
                };
            },
            
            /**
             * Register a new endpoint implementation (e.g. using http-get, http-post, websockets, webworkers, or anything else...).
             */
            registerImplType: function(implType) {
                squishy.assert(typeof(implType) === 'object', 
                    'ComponentEndpointImpl definition must implement the `ComponentEndpointImpl` interface.');
                    
                squishy.assert(implType.ImplName, 'Unnamed ComponentEndpointImpl is illegal. Make sure to set the `ImplName` property.');
                    
                // store it in implementations
                this.implementations[implType.ImplName] = implType;
            },
            
            /**
             * Initializes the host endpoint for the given hostComponents and registers the client endpoint.
             */
            setupCommunications: function(app, cfg) {
                // get implementation (HttpPost is the default)
                var implName = cfg.name || 'HttpPost';
                squishy.assert(this.implementations.hasOwnProperty(implName),
                    'ComponentEndpointImpl of type "' + implName + '" does not exist. Available types are: ' + Object.keys(this.implementations));
                var implType = this.implementations[implName];

                // remember trace config option
                traceKeepOpenDepth = cfg.traceKeepOpen;

                // register implementation as lib (so we also get access to it on the client side)
                implType.Name = this.getImplComponentLibName();
                ComponentDef.lib(implType);
            },

            /**
             * This should be called if there was any connection error.
             */
            reportConnectionError: function(req, res, err) {
                this.events.connectionError.fire(req, res, err);
            },

            Private: {
                /**
                 * The queue handles client requests.
                 */
                queue: null,
                interceptStack: null,
                sendListeners: [],
                connectionData: {},

                __ctor: function() {
                    this.queue = new CommandQueue(this);
                    this.interceptStack = new CommandStack(this);
                    this.keptOpen = 0;
                    this.moveNextCb = this.moveNext.bind(this);
                },

                onClientBootstrap: function() {
                },


                // ##############################################################################################################
                // Methods to execute code while respecting the instance's action queue

                addSendListener: function(cb) {
                    this.sendListeners.push(cb);
                },

                /**
                 * Executes the given user requested callback in the right order.
                 * If the `movesNext` parameter should is set to true, the given callback must make sure
                 * to explicitely notify the queue to move forward, once finished.
                 * If set to false, `cb` will be handed another callback as first argument. That callback
                 * should be called once all actions triggered by `cb` have completed.
                 * @param {Bool} movesNext Whether the callback will explicitely move the queue forward.
                 */
                executeInOrder: function(cb, movesNext) {
                    this.queue.executeInOrder(cb, movesNext);
                },

                /**
                 * Used by endpoint implementations to execute and/or put commands.
                 */
                executeCommandRequest: function(commands, connectionState) {
                    var cb = function() {
                        this.executeCommandRequestNow(commands, connectionState);
                    }.bind(this);

                    this.queue.executeInOrder(cb, true);
                },

                /**
                 * Calls code on host side that might raise commands to be sent to the clients.
                 * The commands will be sent through the given `connection` object.
                 * In order for this to happen, we temporarily store all current connection-related information on a stack and 
                 * reset them on flush.
                 */
                executeCommandRaisingCode: function(connection, code, doneCb, connectionState) {
                    var cb = function() {
                        // keep open
                        this.keepOpenInternal();

                        // override state, and add the code for resetting state to the queue
                        this.setConnectionOverride(connection, doneCb);

                        // setup command buffer
                        this.startRequest(connectionState);
                        
                        // run code 
                        code();

                        // flush
                        this.flush();
                    }.bind(this);

                    // put request on intercept stack, so it will be the first thing to be executed after the current thing
                    this.interceptStack.executeInOrder(cb, true);
                },


                // ##############################################################################################################
                // Methods to be used for connection management (delivered by ComponentTools)

                /**
                 * Prevent the current connection from closing.
                 * Make sure to call `flush`, once you are done.
                 */
                keepOpen: function() {
                    if (!this.isBuffering()) {
                        console.error(new Error('Tried to keep open a connection that was alread flushed.').stack);
                        return;
                    }

                    this.keepOpenInternal();
                },

                keepOpenInternal: function() {
                    ++this.keptOpen;

                    if (traceKeepOpenDepth) {
                        traceKeepOpen('keepOpen', this.keptOpen-1);
                    }
                },

                /**
                 * Signals that an asynchronous operation completed.
                 * Flushes the current buffer, if this was the last pending asynchronous operation.
                 */
                flush: function() {
                    --this.keptOpen;

                    if (traceKeepOpenDepth) {
                        traceKeepOpen('flush', this.keptOpen);
                    }
                    
                    if (this.keptOpen) return;

                    if (!this.isBuffering()) {
                        console.error(new Error('Tried to flush a connection that was alread flushed.').stack);
                    }
                    else {
                        // finally, finish up
                        this.finishRequest();
                    }
                },


                // ##############################################################################################################
                // Internal: Queue management, command routing & connection state management

                executeCommandRequestNow: function(commands, connectionState) {
                    this.keepOpenInternal();

                    // process commands and remember all commands to be sent back to client
                    this.startRequest(connectionState);

                    // start executing commands
                    this.Instance.Libs.CommandProxy.executeClientCommandsNow(commands);

                    this.flush();
                },

                /**
                 * Sends or buffers the given command request.
                 */
                sendCommandToClient: function(compName, cmdName, args) {
                    if (this.isBuffering()) {
                        // if buffering, just keep accumulating and send commands back later
                        var buf = this.connectionData.commandBuffer;
                        
                        buf.push({
                            comp: compName,
                            cmd: cmdName,
                            args: args
                        });
                    }
                    else if (!this.connectionData.connectionState) {
                        var cmdName = compName + '.Public.' + cmdName;
                        console.error(new Error('Tried to execute command `' + cmdName + '` on client while no client was connected. ' +
                            'Make sure to use `this.Tools.keepOpen` and `this.Tools.flush` when performing asynchronous operations.').stack);
                    }
                    else {
                        // send command right away
                        var commands = this.ComponentCommunications.createSingleCommandPacket(compName, cmdName, args);

                        var connectionImpl = this.getCurrentConnection();
                        connectionImpl.sendCommandsToClient(commands, this.connectionData.connectionState);
                    }
                },

                isBuffering: function() {
                    return !!this.connectionData.commandBuffer;
                },

                /**
                 * We are about to execute code that will produce commands to be sent to the client.
                 */
                startRequest: function(connectionState) {
                    // remember all commands to be sent back to client
                    this.connectionData.commandBuffer = [];

                    // remember the implementation-specific connection state object
                    this.connectionData.connectionState = connectionState;
                    
                    trace('startRequest');
                },

                /**
                 * We have finished executing code that produced commands to be sent to the client.
                 * Now send all collected commands back.
                 */
                finishRequest: function() {
                    // get current connection
                    var connection = this.getCurrentConnection();

                    // commands finished executing; now send all collected commands back to client in one chunk
                    connection.sendCommandsToClient(this.connectionData.commandBuffer, this.connectionData.connectionState);

                    // call send listeners
                    for (var i = 0; i < this.sendListeners.length; ++i) {
                        this.sendListeners[i]();
                    }
                    // remove listeners (they are only one-shot)
                    this.sendListeners.length = 0;

                    trace('finishRequest');

                    // unset stuff
                    this.connectionData.commandBuffer = null;
                    this.connectionData.connectionState = null;
                    this.unsetConnectionOverride();

                    this.moveNext();
                },

                moveNext: function() {
                    // check intercepts
                    if (!this.interceptStack.moveNext()) {
                        // no intercepts -> move queue forward
                        this.queue.moveNext();
                    }
                },

                executeCbNow: function(cb) {
                    cb(this.moveNextCb);
                },

                getOverrideConnection: function() {
                    var internalContext = this.Instance.Libs.ComponentContext.getInternalContext();
                    if (internalContext.currentConnection) {
                        return internalContext.currentConnection;
                    }
                    return null;
                },

                /**
                 * Get an explicitely assigned connection object, or the
                 * instance of the currently used connection implementation.
                 */
                getCurrentConnection: function() {
                    // first check if the connection implementation was overridden
                    var internalContext = this.Instance.Libs.ComponentContext.getInternalContext();
                    if (internalContext.currentConnection) {
                        return internalContext.currentConnection;
                    }

                    // if not, return default
                    return this.getDefaultConnection();
                },

                /**
                 * Tell this library to route all communication for the current instance through the given
                 * connection object for now.
                 * Remember the original connection state and reset it, once all code for this connection has been executed.
                 */
                setConnectionOverride: function(connection, doneCb) {
                    // store all internal state and override connection
                    var internalContext = this.Instance.Libs.ComponentContext.getInternalContext();
                    internalContext.currentConnection = connection;
                    internalContext.setConnectionOverrideCb = doneCb;
                    
                    trace('setConnectionOverride');
                },

                /** 
                 * Clean up a connection override (if there was any) and call pending callback.
                 */
                unsetConnectionOverride: function() {
                    trace('unsetConnectionOverride');

                    var internalContext = this.Instance.Libs.ComponentContext.getInternalContext();
                    var cb = internalContext.setConnectionOverrideCb;
                    if (cb) {
                        // clean up
                        internalContext.currentConnection = null;
                        internalContext.setConnectionOverrideCb = null;

                        // call the cb
                        cb();
                    }
                },


                // ##############################################################################################################
                // Reply to a pending `onReply` callback on the client side.

                sendReply: function(replyId, args) {
                    this.client.returnReply(replyId, args);
                }
            }
        };
    }),
    
    
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        var timer;
        var buffer = [];
        var lastReplyId = 0;
        var pendingCbs = {};

        var sendBufferToHost = function() {
            // send out buffer;
            thisInstance.getDefaultConnection().sendCommandsToHost(buffer);

            // clear buffer
            buffer.length = 0;

            // unset timer
            timer = null;
        };

        var Packet = {
            onReply: function(cb) {
                this.replyId = ++lastReplyId;
                pendingCbs[this.replyId] = cb;

                return this;        // return self for further chaining
            }
        };

        var thisInstance;
        return thisInstance = {
            sendCommandToHost: function(compName, cmdName, args) {
                // build packet & store in buffer
                var cmdPacket = Object.create(Packet);
                cmdPacket.comp = compName;
                cmdPacket.cmd = cmdName;
                cmdPacket.args = args;
                buffer.push(cmdPacket);

                // do not send out every command on its own;
                // instead, always wait a minimal amount of time and then send
                // a batch of all commands together
                if (!timer) {
                    timer = setTimeout(sendBufferToHost, 1);
                }
                return cmdPacket;
            },

            Public: {
                /**
                 * Host has replied to our pending `onReply` request.
                 */
                returnReply: function(replyId, args) {
                    // get cb
                    var cb = pendingCbs[replyId];
                    if (!cb) {
                        console.warn('Host sent return reply with invalid `replyId`: ' + replyId);
                        return;
                    }

                    // delete cb from set and execute it
                    delete pendingCbs[replyId];
                    cb.apply(null, args);
                }
            }
        };
    })
});

// TODO: CSRF
    // // token necessary for preventing CSRF: http://en.wikipedia.org/wiki/Cross-site_request_forgery
    // res.locals.csrfToken = req.session.csrfToken = req.session.csrfToken || tokenStore.generateTokenString();
    // // check if command exists and CSRF token matches
    // if (cmd && req.body.csrf === sess.csrfToken) {
        // cmd(req, res, next);
    // }
    // else {
        // next();
    // }

 
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
                deserialize: function(objString, includeCode) {
                    if (includeCode) {
                        return eval(objString);
                    }
                    return JSON.parse(objString);
                }
            }
        };
    }),
    
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        var serializer;
        return {
            __ctor: function() {
                serializer = this.Serializer;
            },

            /**
             * Initialize host-side endpoint implementation (which delivers the low-level mechanism to transfer command requests between client & host).
             */
            initHost: function(app, cfg) {
                squishy.assert(app.post, 'Invalid argument for initHost: `app` does not have a `post` method. ' +
                    'Make sure to pass an express application object to `ComponentLoader.start` when using ' +
                    'NoGap\'s default HttpPost implementation.');
            
                // define router callback
                var cb = function(req, res, next) {
                    // register error handler
                    var onError = function(err) {
                        Shared.Libs.ComponentCommunications.reportConnectionError(req, res, err);
                    };
                    req.on('error', onError);
                    
                    // This will currently cause bugs
                    // see: https://github.com/mikeal/request/issues/870
                    // req.socket.on('error', onError);

                    // extract body data
                    // see: http://stackoverflow.com/a/4310087/2228771
                    var session = req.session;

                    var sessionId = req.sessionID;
                    console.assert(session,
                        'req.session was not set. Make sure to use a session manager before the components library, when using the default Get bootstrapping method.');
                    console.assert(sessionId, 
                        'req.sessionID was not set. Make sure to use a compatible session manager before the components library, when using the default Get bootstrapping method.');
                    
                    // TODO: Add CSRF security
                    
                    var body = '';
                    req.on('data', function (data) {
                        body += data;
                    });
                    req.on('end', function () {
                        var commands;
                        try {
                            commands = serializer.deserialize(body);
                        }
                        catch (err) {
                            console.warn('Invalid data sent by client: ' + body + ' -- Error: ' + err.message || err);
                            next();
                            return;
                        }
                        
                        if (!commands) return;

                        // set session & get instance object
                        // TODO: Check if that works with parallel requests
                        var Instance = Shared.Libs.ComponentInstance.activateSession(session, sessionId);

                        if (!Instance) {
                            // use a bit of a hack to tell the client to refresh current installation:
                            commands = Shared.Libs.ComponentCommunications.createSingleCommandPacket(
                                Shared.Libs.ComponentBootstrap.getImplComponentLibName(), 'refresh');
                            this._def.InstanceProto.sendCommandsToClient(commands, res);
                            return;
                        }
                        
                        Instance.Libs.ComponentContext.touch();                         // update last used time
                        
                        // execute actions
                        Instance.Libs.ComponentCommunications.executeCommandRequest(commands, res);
                    }.bind(this));
                }.bind(this);
                
                // register router callback
                app.post(cfg.baseUrl, cb)
                	.on('error', function(err) {
                    	console.error('Connection error during HTTP get: ' + err);
                    });;
            },

            Private: {
                onClientBootstrap: function() {
                    var clientRoot = this.Context.clientRoot;
                    console.assert(clientRoot, 'INTERNAL ERROR: clientRoot has not been set by ComponentBootstrap.');

                    // Make sure that client knows where to send its AJAX requests.
                    // If we don't have that, the client side of the component framework does not know how to send commands.
                    this.client.setUrl(clientRoot);
                }, 

                staysOpen: function() {
                    return false;
                },

                /**
                 * This host-side function is called when a bunch of client commands are to be sent to client.
                 */
                sendCommandsToClient: function(commands, res) {
                    console.assert(res, 'INTERNAL ERROR: `connectionState` was not set.');

                    var commStr;
                    try {
                        // Serialize
                        commStr = serializer.serialize(commands);
                    }
                    catch (err) {
                        // delete args, so we can atually produce a string representation of the commands
                        for (var i = 0; i < commands.length; ++i) {
                            delete commands[i].args;
                        }

                        // re-compute string representation, without complex arguments
                        // This *MUST* work, unless there is a bug in the packaging code in this file.
                        commStr = squishy.objToString(commands, true);

                        // then report error
                        throw new Error(
                            '[NoGap] Invalid remote method call: Tried to send too complicated object. ' + 
                            'Arguments to remote methods must be simple objects or functions (or a mixture thereof). ' +
                            'If the failed commands contain `ComponentCommunications.returnReply`, ' +
                            'this error was caused by the arguments of a call to `client.reply`.\n' +
                            'Failed commands:\n ' + commStr + '. ' );
                    }


                    // flush response & close connection
                    res.contentType('application/json');
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.write(commStr);
                    res.end();
                    res = null;
                },
            }
        };
    }),

    
    /**
     * This code will only execute on the client side of a component.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        var clientUrl;
        var serializer;

        return {
            __ctor: function() {
                serializer = this.Serializer;
            },

            Public: {
                setUrl: function(newClientUrl) {
                    clientUrl = newClientUrl;
                }
            },
            
            Private: {
                /**
                 * This client-side function is called when a host command is called from a client component.
                 * It will transport the commands to the host, wait for the reply, and then execute the commands that were sent back.
                 */
                sendCommandsToHost: function(commands) {
                    // send Ajax POST request (without jQuery)
                    var xhReq = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP");
                    
                    // send out the command request
                    //console.log(clientUrl);
                    xhReq.open('POST', clientUrl, true);
                    //xhReq.setRequestHeader('Content-type','application/json; charset=utf-8;');
                    xhReq.setRequestHeader('Content-type','application/json');
                    xhReq.onerror = function() {
                        console.error('AJAX request failed: ' + xhReq.responseText);
                    };
                    xhReq.onreadystatechange = function() {
                        if (xhReq.readyState != 4) return;
                        
                        if (xhReq.status==200) {
                            if (xhReq.responseText) {
                                // host sent commands back, in response to our execution request
                                var hostCommands;
                                try {
                                    // Deserialize
                                    hostCommands = serializer.deserialize(xhReq.responseText, true);
                                }
                                catch (err) {
                                    console.error('Unable to parse commands sent by host: ' + err + ' -- \n' + xhReq.responseText);
                                    return;
                                }

                                // execute the hostCommands
                                Instance.Libs.CommandProxy.execHostCommands(hostCommands);
                            }
                            
                        }
                        else {
                            console.error('Invalid status from host: ' + xhReq.responseText);
                        }
                    };
                    
                    // send commands
                    var commandStr = serializer.serialize(commands);
                    xhReq.send(commandStr);
                }
            }
        };
    })
};

// register default implementation types:
ComponentCommunications.registerImplType(HttpPostImpl);

module.exports = ComponentCommunications;