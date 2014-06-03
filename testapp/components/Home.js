/**
 * This component is only available to logged in users, and acts as the landing page for them.
 */
"use strict";
 
// This is how we would usually do it:
//var ComponentDef = require('components').Def;
var ComponentDef = Components.Def;


/**
 * Make sure, things work just right.
 */
module.exports = ComponentDef.component({
    Namespace: 'bjt',
    
    /**
     * The `Host` endpoint of a component lives in the host context and is also returned by `ComponentDef.component`.
     * Methods inside the `Public` instance prototype can be called by the client.
     */
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) {
        return {
            Assets: {
            	/**
            	 * The contents of file assets will be available as properties in the client's `asset` object.
            	 */
                Files: {
                    string: {
                        // main template
                        view: 'home.html'
                    }
                },
            },

            Public: {
            	logout: function() {
            		// destroy session:
            		var sess = this.Context.session;
            		sess.destroy();

            		// notify client that we logged out
            		this.client.onLogout();
            	}
            }
        };
    }),
    


    // ####################################################################################################################
    // Client
    
    /**
     * The `Client` declaration is deployed to and then executed on the client.
     * Note that the function also needs to be executed on the `Host` just once to get the `Public` object.
     * That is why you should move any complex private variable initialization into `__ctor` or some other method.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
    	return {
            /**
             * Defines the Home controller.
             */
            setupView: function(Main, app) {
                var This = this;
                
                // create Home controller
                app.lazyController('homeCtrl', function($scope) {
            		$scope.busy = false;
                	$scope.clickLogout = function() {
                		$scope.busy = true;
                		This.host.logout();
                	};
                });

                // register page
                Main.addPage(this, this.assets.view);
            },

            Public: {
            	onLogout: function() {
            		Instance.Main.onUserChanged(null);
            	}
            }
        };
    })
});