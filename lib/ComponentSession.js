/**
 * This file provides the (rather minimal) session interface for the component library.
 */
 "use strict";

 var ComponentDef = require('./ComponentDef');

 module.exports = ComponentDef.lib({
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        return {
            initHost: function() {
            },

            Private: {
                getSessionId: function() {
                    var internalContext = this.Instance.Libs.ComponentContext.getInternalContext();
                    return internalContext.sessionId;
                },
                
                setSession: function(sender, session, sessionId) {
                    // set session & session id
                    this.Context.session = session;
                    this.Context.sessionId = sessionId;
                }
            },
        };
    }),


    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        return {
            Private: {
                initClient: function() {
                },
            },
                
            Public: {
            }
        };
    }),
});