/**
 * This file provides the public interface for accessing NoGap functionality.
 */
/*jslint node: true */
"use strict";

module.exports = {
	/** 
	 * ComponentDef gives all the registration methods and access to Shared component object on host.
	 */
	Def: require('./lib/ComponentDef'),

	/**
	 * ComponentLoader provides the `start` method to install & bootstrap the whole bunch.
	 */
	Loader: require('./lib/ComponentLoader'),

	/**
	 * ComponentBootstrap is useful for the advanced user:
	 * You can provide your own bootstrap implementation to bootstrap components to things other than the default browser environment (e.g. webworker).
	 */
	Bootstrap: require('./lib/ComponentBootstrap'),

	/**
	 * ComponentCommunications is also useful for the advanced user:
	 * You can provide your own connection implementation to use other ways of transporting requests between host + client (e.g. websockets).
	 */
	Communications: require('./lib/ComponentBootstrap')
};