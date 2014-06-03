NoGap
=============

The NoGap framework delivers RPC + asset management + some other good stuff for enjoyable Host &lt;-> Client architecture development.

This module is called `No` `Gap` because it removes the typical gap that exists between
host and client and that makes a client<->server architecture so cumbersome to develop.

NoGap's primary use case is to develop rich client-side applications while alleviating the typical hassles of doing so.

Have a look at the [Samples](samples) for reference.



Installation
=============

* [Install Node](http://nodejs.org/download/)
    * Make sure to select `Add to PATH` during GUI-based installation.
* Open a command line
	* On Windows: Press `Ctrl+R` -> Type `cmd` -> `Enter`
* Run: `npm install nogap`
* Done.


[Samples](samples)
=============

# [HelloWorld](samples/HelloWorld)

```js
var NoGapDef = require('nogap').Def;

module.exports = NoGapDef.component({
	Client: NoGapDef.defHost(function(Tools, Instance, Context) {
		return {
			initClient: function() {
				document.body.innerHTML = 'Hello World!';
			}
		};
	});
});
```

What did we do?
 * Get the NoGap module's `Def` helper: `var NoGapDef = require('nogap').Def;`
 * Define a new component: `NoGapDef.component({ ... });`
 * Add a `Client` definition to the component: `Client: NoGapDef.defClient(function(Tools, Instance, Context) { ... })`
 * Add `initClient` method  to `Client`

What is the trick?
 * The `Client` object is automatically deployed to the client
 * `initClient` is then automatically called on the client, right after installation


# [TwoWayStreet](samples/TwoWayStreet)<a name="twowaystreet"></a>

```js
var NoGapDef = require('nogap').Def;

NoGapDef.component({
    Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) {
        var iAttempt = 0;

        return {
            Public: {
                tellClientSomething: function() {
                    this.client.showHostMessage('We have exchanged ' + ++iAttempt + ' messages.');
                }
            }
        };
    }),

    Client: NoGapDef.defClient(function(Tools, Instance, Context) {
        return {
            initClient: function() {
                window.clickMe = function() {
                    document.body.innerHTML +='Button was clicked.<br />';
                    this.host.tellClientSomething();
                }.bind(this);

                document.body.innerHTML += '<button onclick="window.clickMe();">Click Me!</button><br />';
            },

            Public: {
                showHostMessage: function(msg) {
                    document.body.innerHTML +='Server said: ' + msg + '<br />';
                }
            }
        };
    })
});
```

What did we do?
 * Get the NoGap module's `Def` helper: `var NoGapDef = require('nogap').Def;`
 * Define a new component: `NoGapDef.component({ ... });`
 * Add a `Host` definition to the component: `Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) { ... })`
 * Add a `Client` definition to the component: `Client: NoGapDef.defClient(function(Tools, Instance, Context) { ... })`
 * Add `Host.Public`
 * Add `Client.initClient`
 * Add `Client.Public`

How does it work?
 * When we open the browser, we see a button
 * When we click the button, we call `this.host.tellClientSomething`
    * `this.host` gives us an object on which we can call `Public` methods on the host
    * For example, we can call `tellClientSomething` which is a method that was defined in `Host.Public`
 * Once the host receives our request, it sends something back
 	* `this.client.showHostMessage` is called to send something back
 	* Similarly to `this.host` on the client side, `this.client` gives access to the client's `Public` methods
 * Finally, the `showHostMessage` is called on the client side and shows us the message sent by the host


# [TwoWayStreetAsync](samples/TwoWayStreetAsync)

Now that our code keeps growing and you are starting to get the picture, let us just focus on code snippets from now on.

Imagine the server had to do an asynchronous operation in [`tellClientSomething`](#twowaystreet).
For example, it needs to read a file, or get something from the database.

```js
tellClientSomething: function() {
    this.Tools.keepOpen();

    // wait 500 milliseconds before replying
    setTimeout(function() {
        this.client.showHostMessage('We have exchanged ' + ++iAttempt + ' messages.');
        this.Tools.flush();
    }.bind(this), 500);
}
```

What did we do?
 * Get the NoGap module's `Def` helper: `var NoGapDef = require('nogap').Def;`
 * Define a new component: `NoGapDef.component({ ... });`
 * Add a `Host` definition to the component: `Host: NoGapDef.defHost(function(SharedTools, Shared, SharedContext) { ... })`
 * Add a `Client` definition to the component: `Client: NoGapDef.defClient(function(Tools, Instance, Context) { ... })`
 * Add `Host.Public`
 * Add `Client.initClient`
 * Add `Client.Public`

How does it work?
 * When we open the browser, we see a button
 * When we click the button, we call `this.host.tellClientSomething`
    * `this.host` gives us an object on which we can call `Public` methods on the host
    * For example, we can call `tellClientSomething` which is a method that was defined in `Host.Public`
 * Once the host receives our request, it sends something back
 	* `this.client.showHostMessage` is called to send something back
 	* Similarly to `this.host` on the client side, `this.client` gives access to the client's `Public` methods
 * Finally, the `showHostMessage` is called on the client side and shows us the message sent by the host



<a name="getting_started"></a>Getting Started
=============

This tutorial is aimed at those who are new to `NoGap`, and new to `Node` in general.
It should help you bridge the gap from the [Code Snippets](#code_snippets) to a real-world application.

# Recommended File Structure
    .
    +-- components/
    +-- lib/
    +-- pub/
    +-- package.json
    +-- appConfig.js
    +-- app.js

Let's have a look at the different files and folders:

## package.json

This is the standard `Node` configuration file. Here you can declare your app's basic metadata and, most importantly, your dependencies.
If you need one of the thousands over thousands of publicly available `Node` modules, two steps are required:

 1. add their name and your preferred version to `dependencies`
 2. Run `npm install`

Done. Now the new module is available in your code via:

`var someModule = require('some-module');`

where `some-module` is the name you gave it in the package.json file.

Check out <a href="https://www.npmjs.org/">https://www.npmjs.org/</a> to see all available modules.


## `components/`

This folder contains your `NoGap` components, and possibly (some of) their assets. You can name it anything you want.
NOTE: Placing assets (such as *.html templates, stylesheets, images etc.) next to code is actually good style, if it supports modularization.
If your components are mostly self-contained, you can easily move their whole folder, including their assets, to deploy them in other places.


## `appConfig.js`

This is your custom configuration file. You can name it anything you want.
It contains some basic constant data that your application needs, such as database login and other setup information.
The following is an example of a `NoGap` configuration. It requires at least three entries:

 * `baseFolder`
  	* This is the folder, relative to your application (e.g. `app.js`) where you defined all NoGap components.
 * `publicFolder`
 	* The folder to find all client asset files that cannot be found relative to a component.
 	* Usually this is used to store client-only and shared javascript libraries that do not have `NoGap` support.
 * `files`
 	* The actual component files (sans ".js"). Whenever you add a component, don't forget to list it here!


```js
"nogap": {
    "baseFolder"   : "components",
    "publicFolder" : "pub",
    "files"        : [
        // list all components here:

        // utilities
        "ValidationUtil",

        // pages for guests
        "Guest",

        // pages for users
        "Main",
        "Home"
    ]
}
```

There are more, optional parameters. Documentation will come soon.


## `app.js`

This defines your actual application. You can name it anything you want. Usually this file only does two things:

 1. Setup your app
 2. Start your <a href="http://expressjs.com/4x/api.html">`express` server</a>

Express is the standard Node way of starting a web server and let clients connect.
Once it is running you can connect to it with your browser on the specified port.

With `NoGap`, we add one more job to it:

 1. Setup your app
 2. Initialize `NoGap`
 3. Start your <a href="http://expressjs.com/4x/api.html">`express` server</a>
