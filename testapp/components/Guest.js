/**
 * This component takes care of rendering things for users who are not logged in.
 */
"use strict";

// This is how we would usually do it:
//var ComponentDef = require('components').Def;
var ComponentDef = Components.Def;


module.exports = ComponentDef.component({
    Namespace: 'bjt',

    /**
     * The HostComponent instance will live in the host context (here).
     * Functions inside HostComponent.command can be called by the client.
     */
    Host: ComponentDef.defHost(function(SharedTools, Shared, SharedContext) { return {
        Assets: {
            Files: {
                string: {
                    view: 'guest.html'
                }
            },
            AutoIncludes: {
            }
        },
                
        /**
         * Host commands can be directly called by the client.
         */
        Public: {
            /**
             * This command is available to any client, via this.host.tryLogin(userName);
             */
            tryLogin: function(userName) {
                if (userName.startsWith('guest')) {
                	// keep open connection for asynchronous operation
                	this.Tools.keepOpen();
                	setTimeout(function() {
	                    // notify client
	                	this.client.onLogin('Invalid user name: ' + userName);

	                	this.Tools.flush();	// we are done here
                	}.bind(this), 1000);
                }
                else {
                    // get session
                    var session = this.Context.session;

                    // set userName
                    session.userName = userName;

                    // notify client
                	this.client.onLogin(null, userName);
                }
            }
        },
    };}),
    
    
    /**
     * The `Client` declaration is deployed to and then executed on the client.
     * Note that the function also needs to be executed on the `Host` just once to get the `Public` object.
     * That is why you should move any complex private variable initialization into `__ctor` or some other method.
     */
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
    	var scope;

        /**
         * Tell Angular to re-render dirty variables inside the main view.
         * @see http://stackoverflow.com/a/23769600/2228771
         */
        var invalidateView = function() {
            if (!scope.$$phase) scope.$apply();
        };

        return {
            /**
             * Called by `Main`
             */
            setupView: function(Main, app) {
                var This = this;
                
                // create login controller
                // see: http://stackoverflow.com/questions/22589324/angular-js-basic-controller-return-error
                // see: http://scotch.io/tutorials/javascript/submitting-ajax-forms-the-angularjs-way
                app.lazyController('guestCtrl', function($scope) {
                    // data to populate the login form
                    $scope.loginData = {
                        userName: '',
                    };

                    $scope.busy = false;
                    $scope.errorMessage = null;
                   
                    // the function to be called when `login` is clicked
                    $scope.clickLogin = function() {
                        $scope.busy = true;
	                    $scope.errorMessage = null;

                        // send login request to host
                        This.host.tryLogin($scope.loginData.userName);
                    };

                    // remember scope
                    scope = $scope;
                });

                // register page
                Main.addPage(this, this.assets.view);
            },
            
            
            /**
             * Client commands can be directly called by the host.
             */
            Public: {
            	/**
            	 * Called after a (failed or successful) attempt to login:
            	 */
                onLogin: function(err, userName) {
                    scope.busy = false;
                    if (err) {
	                	// login failed:
	                    scope.errorMessage = err;
	                }
	                else {
	                	// login succeeded:
	                    // go to home page
	                    Instance.Main.onUserChanged(userName);
	                }

                    // tell Angular to re-render dirty parts
                    invalidateView();
                }
            }
        };
    })
});