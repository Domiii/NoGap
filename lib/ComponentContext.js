/**
 * This file provides a simple interface for using the shared and instance `Context` objects.
 */
 "use strict";

 var ComponentDef = require('./ComponentDef');

 module.exports = ComponentDef.lib({
	Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) { 
		return {
            // Shared Context
            __ctor: function() {
                // decorate shared context here
            },

			/**
			 * This is called by `ComponentInstance` to create a new Context shared by all component instances of a new client.
			 */
			createInstanceContext: function(Instance) {
				return {};
			},

    		/**
    		 * Get or create the internal shared context object.
    		 * This internal context is used by the Components library itself to manage connection and other internal state.
    		 */
    		getInternalContext: function() {
    			if (!SharedContext._internal) {
    				Object.defineProperty(SharedContext, '_internal', {
    					value: {}
    				})
    			}
    			return SharedContext._internal;
    		},


    		Private: {
    			getContext: function() {
    				return this.Context;
    			},

	    		/**
	    		 * Get or create the internal instance context object.
	    		 * This internal context is used by the Components library itself to manage connection and other internal state.
	    		 */
	    		getInternalContext: function() {
	    			if (!this.Context._internal) {
	    				Object.defineProperty(this.Context, '_internal', {
	    					value: {}
	    				})
	    			}
	    			return this.Context._internal;
	    		},


	    		// ########################################################################################################################
	    		// Manage some general host instance maintenance information

    			/**
    			 * Update last used time
    			 */
    			touch: function() {
                    // NYI
    			}
    		}
		};
	}),

    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        return {
            __ctor: function() {
                SharedContext.IsHost = 1;
                SharedContext.IsClient = 0;
            },

            initHost: function() {
            },

            getContext: function(sessionId) {
                if (sessionId) {
                    var instance = Shared.Libs.ComponentInstance.getInstanceMap(sessionId);
                    if (instance) return instance.Context;

                    // invalid session id or something like that...
                    return null;
                }
                return SharedContext;
            },


            Private: {
                onNewClient: function() {
                    /**
                     * Upon principal-change (when user privileges change), we want to refresh
                     * our security measures.
                     * @see http://security.stackexchange.com/questions/22903/why-refresh-csrf-token-per-form-request
                     */
                    var This = this;
                    this.Context.notifySessionPrincipalChange = function() {
                        return This.Instance.Libs.ComponentCommunications.updateClientIdentity();
                    };
                }
            },

            Public: {
            }
        };
    }),


    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        return {
            __ctor: function() {
                Context.IsHost = 0;
                Context.IsClient = 1;
            },

            Private: {
                initClient: function() {
                },
            },
                
            Public: {
            }
        };
    }),
});